"""Dataset requests: visibility, creation, listing and status transitions."""

from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import ColumnElement, ScalarSelect, func, select
from sqlalchemy.orm import Session, joinedload

from app.core.errors import ConflictError, InvalidInputError, NotFoundError
from app.models import Assignment, DatasetRequest, RequestStatus, RequestStatusHistory, User, UserRole
from app.schemas.request import RequestCreate, RequestSort
from app.services.workflow import OPEN_STATUSES, allowed_transitions, check_transition


@dataclass(frozen=True)
class RequestFilters:
    status: RequestStatus | None = None
    task_name: str | None = None
    client_id: int | None = None
    deadline_before: date | None = None
    sort: RequestSort = "newest"


@dataclass(frozen=True)
class RequestDetailView:
    request: DatasetRequest
    assigned_count: int
    history: list[RequestStatusHistory]
    allowed_transitions: list[RequestStatus]


def _visible_to(user: User) -> list[ColumnElement[bool]]:
    """Row-level access rule: clients only ever see their own requests.

    Every query that reads requests goes through this, so a client asking for
    someone else's request id gets a 404 — indistinguishable from a missing one.
    """
    return [DatasetRequest.client_id == user.id] if user.role == UserRole.CLIENT else []


def _assigned_count() -> ScalarSelect[int]:
    return (
        select(func.count(Assignment.id))
        .where(Assignment.request_id == DatasetRequest.id)
        .correlate(DatasetRequest)
        .scalar_subquery()
    )


def count_assignments(db: Session, request_id: int) -> int:
    return db.scalar(select(func.count(Assignment.id)).where(Assignment.request_id == request_id)) or 0


def get_request_for_user(db: Session, request_id: int, user: User, *, lock: bool = False) -> DatasetRequest:
    """Load a request the user may see. ``lock=True`` takes a row lock (SELECT ... FOR UPDATE)
    so status changes and assignment changes on the same request are serialised."""
    stmt = select(DatasetRequest).where(DatasetRequest.id == request_id, *_visible_to(user))
    if lock:
        stmt = stmt.with_for_update()
    request = db.scalar(stmt.execution_options(populate_existing=True))
    if request is None:
        raise NotFoundError("Request not found")
    return request


def get_request_detail(db: Session, request_id: int, user: User) -> RequestDetailView:
    request = db.scalar(
        select(DatasetRequest)
        .options(joinedload(DatasetRequest.client))
        .where(DatasetRequest.id == request_id, *_visible_to(user))
        .execution_options(populate_existing=True)
    )
    if request is None:
        raise NotFoundError("Request not found")
    history = db.scalars(
        select(RequestStatusHistory)
        .options(joinedload(RequestStatusHistory.changed_by))
        .where(RequestStatusHistory.request_id == request.id)
        .order_by(RequestStatusHistory.changed_at, RequestStatusHistory.id)
    ).all()
    return RequestDetailView(
        request=request,
        assigned_count=count_assignments(db, request.id),
        history=list(history),
        allowed_transitions=allowed_transitions(request.status, user.role),
    )


def list_requests(
    db: Session, user: User, filters: RequestFilters, *, offset: int, limit: int
) -> tuple[list[tuple[DatasetRequest, int]], int]:
    conditions = _visible_to(user)
    if filters.status:
        conditions.append(DatasetRequest.status == filters.status)
    if filters.task_name and filters.task_name.strip():
        conditions.append(DatasetRequest.task_name.icontains(filters.task_name.strip(), autoescape=True))
    if filters.client_id is not None:
        conditions.append(DatasetRequest.client_id == filters.client_id)
    if filters.deadline_before:
        conditions.append(DatasetRequest.deadline <= filters.deadline_before)

    if filters.sort == "deadline":
        order_by = (DatasetRequest.deadline.asc(), DatasetRequest.id.asc())
    else:
        order_by = (DatasetRequest.created_at.desc(), DatasetRequest.id.desc())

    total = db.scalar(select(func.count()).select_from(DatasetRequest).where(*conditions)) or 0
    rows = db.execute(
        select(DatasetRequest, _assigned_count())
        .options(joinedload(DatasetRequest.client))  # one query for the page, no N+1
        .where(*conditions)
        .order_by(*order_by)
        .offset(offset)
        .limit(limit)
    ).all()
    return [(request, assigned) for request, assigned in rows], total


def request_summary(db: Session, user: User) -> tuple[dict[RequestStatus, int], int]:
    """Request counts by status, and how many open requests are past their deadline."""
    visible = _visible_to(user)
    counts = dict(
        db.execute(
            select(DatasetRequest.status, func.count()).where(*visible).group_by(DatasetRequest.status)
        ).all()
    )
    overdue = db.scalar(
        select(func.count())
        .select_from(DatasetRequest)
        .where(
            *visible,
            DatasetRequest.deadline < datetime.now(UTC).date(),
            DatasetRequest.status.in_(OPEN_STATUSES),
        )
    )
    return {status: counts.get(status, 0) for status in RequestStatus}, overdue or 0


def create_request(db: Session, client: User, data: RequestCreate) -> DatasetRequest:
    request = DatasetRequest(
        client_id=client.id,
        task_name=data.task_name,
        episodes_requested=data.episodes_requested,
        deadline=data.deadline,
        notes=data.notes,
        status=RequestStatus.SUBMITTED,
    )
    db.add(request)
    db.flush()  # assigns request.id for the history row
    db.add(
        RequestStatusHistory(
            request_id=request.id, previous_status=None, new_status=RequestStatus.SUBMITTED, changed_by_id=client.id
        )
    )
    db.commit()
    return request


def transition_request(
    db: Session, request_id: int, target: RequestStatus, actor: User, comment: str | None = None
) -> None:
    """Move a request to ``target`` if the state machine and the business rules allow it.

    The status update and its history row are committed together, under a row lock,
    so concurrent transitions on the same request cannot interleave.
    """
    request = get_request_for_user(db, request_id, actor, lock=True)
    check_transition(request.status, target, actor.role)

    if target == RequestStatus.DELIVERED:
        assigned = count_assignments(db, request.id)
        if assigned < request.episodes_requested:
            raise ConflictError(
                f"A request needs {request.episodes_requested} assigned episodes before it can be delivered "
                f"({assigned} assigned)"
            )
    if target == RequestStatus.REJECTED and not comment:
        raise InvalidInputError("A reason is required to reject a delivery")

    db.add(
        RequestStatusHistory(
            request_id=request.id,
            previous_status=request.status,
            new_status=target,
            changed_by_id=actor.id,
            comment=comment or None,
        )
    )
    request.status = target
    db.commit()
