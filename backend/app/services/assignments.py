"""Assigning episodes to requests.

Rules (enforced here, backed by database constraints):
  * only ``good`` and ``usable`` episodes can be assigned;
  * an episode belongs to at most one request (unique constraint on assignments.episode_id);
  * episodes can only be added/removed while the request is ``in_progress``;
  * a request never receives more episodes than it asked for.
"""

from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.core.errors import ConflictError, NotFoundError
from app.models import (
    ASSIGNABLE_QUALITIES,
    EPISODE_UNIQUE_CONSTRAINT,
    Assignment,
    DatasetRequest,
    Episode,
    RequestStatus,
    User,
)
from app.services.requests import count_assignments, get_request_for_user

_MAX_LISTED = 5


def _describe(items: Sequence[str]) -> str:
    listed = ", ".join(items[:_MAX_LISTED])
    return f"{listed} and {len(items) - _MAX_LISTED} more" if len(items) > _MAX_LISTED else listed


def _ensure_editable(request: DatasetRequest) -> None:
    if request.status != RequestStatus.IN_PROGRESS:
        raise ConflictError(
            f"Episodes can only be changed while a request is in progress (this one is '{request.status}')"
        )


def _is_violation_of(exc: IntegrityError, constraint: str) -> bool:
    return getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == constraint


def assign_episodes(db: Session, request_id: int, episode_ids: Sequence[int], actor: User) -> int:
    """Assign all of ``episode_ids`` or none of them. Returns the new assigned total."""
    request = get_request_for_user(db, request_id, actor, lock=True)
    _ensure_editable(request)

    ids = list(dict.fromkeys(episode_ids))  # de-duplicate, keep order
    episodes = db.scalars(select(Episode).where(Episode.id.in_(ids))).all()

    found = {episode.id for episode in episodes}
    if missing := [str(episode_id) for episode_id in ids if episode_id not in found]:
        raise NotFoundError(f"Episode not found: {_describe(missing)}")

    if bad := [e.episode_id for e in episodes if e.quality not in ASSIGNABLE_QUALITIES]:
        raise ConflictError(f"Only good or usable episodes can be assigned; bad quality: {_describe(bad)}")

    taken = db.execute(
        select(Episode.episode_id, Assignment.request_id)
        .join(Assignment, Assignment.episode_id == Episode.id)
        .where(Episode.id.in_(ids))
        .order_by(Episode.episode_id)
    ).all()
    if taken:
        if len(taken) == 1:
            episode_id, other_request = taken[0]
            raise ConflictError(f"Episode {episode_id} is already assigned to request #{other_request}")
        raise ConflictError(f"Episodes already assigned: {_describe([f'{e} (request #{r})' for e, r in taken])}")

    current = count_assignments(db, request.id)
    remaining = request.episodes_requested - current
    if len(ids) > remaining:
        raise ConflictError(
            f"This request needs {remaining} more episode(s); cannot assign {len(ids)}"
        )

    db.add_all(Assignment(request_id=request.id, episode_id=episode_id, assigned_by_id=actor.id) for episode_id in ids)
    try:
        db.commit()
    except IntegrityError as exc:
        # The checks above ran before another operator's concurrent assignment
        # committed; the unique constraint is the final word.
        db.rollback()
        if _is_violation_of(exc, EPISODE_UNIQUE_CONSTRAINT):
            raise ConflictError(
                "One or more of these episodes was just assigned to another request. Refresh and try again."
            ) from exc
        raise
    return current + len(ids)


def unassign_episode(db: Session, request_id: int, episode_id: int, actor: User) -> None:
    request = get_request_for_user(db, request_id, actor, lock=True)
    _ensure_editable(request)
    assignment = db.scalar(
        select(Assignment).where(Assignment.request_id == request.id, Assignment.episode_id == episode_id)
    )
    if assignment is None:
        raise NotFoundError("This episode is not assigned to this request")
    db.delete(assignment)
    db.commit()


def list_assignments(
    db: Session, request_id: int, user: User, *, offset: int, limit: int
) -> tuple[list[Assignment], int]:
    request = get_request_for_user(db, request_id, user)  # enforces client ownership
    total = db.scalar(select(func.count(Assignment.id)).where(Assignment.request_id == request.id)) or 0
    assignments = db.scalars(
        select(Assignment)
        .options(joinedload(Assignment.episode), joinedload(Assignment.assigned_by))
        .where(Assignment.request_id == request.id)
        .order_by(Assignment.assigned_at.desc(), Assignment.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return list(assignments), total
