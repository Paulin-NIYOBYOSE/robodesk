"""Browsing episodes (the operator's assignment picker)."""

from dataclasses import dataclass

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.text import normalize_task_name
from app.models import ASSIGNABLE_QUALITIES, Assignment, Episode, EpisodeQuality, Robot

# Distinct task names via a "loose index scan": one index probe per distinct value
# (a handful) instead of reading every row, which matters at millions of episodes.
# Uses ix_episodes_task_name_quality_recorded_at.
_DISTINCT_TASK_NAMES = text(
    """
    WITH RECURSIVE tasks AS (
        (SELECT task_name FROM episodes ORDER BY task_name LIMIT 1)
        UNION ALL
        SELECT (SELECT e.task_name FROM episodes e
                WHERE e.task_name > tasks.task_name ORDER BY e.task_name LIMIT 1)
        FROM tasks
        WHERE tasks.task_name IS NOT NULL
    )
    SELECT task_name FROM tasks WHERE task_name IS NOT NULL
    """
)


@dataclass(frozen=True)
class EpisodeFilters:
    task_name: str | None = None
    quality: EpisodeQuality | None = None
    robot_id: str | None = None
    # Only episodes that could be assigned right now (assignable quality, not taken).
    available_only: bool = False
    # Prefix match on episode_id, e.g. "EP-001".
    search: str | None = None


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_episodes(
    db: Session, filters: EpisodeFilters, *, offset: int, limit: int
) -> tuple[list[tuple[Episode, int | None]], int]:
    """Return ``(episode, assigned_request_id)`` rows for one page, plus the total."""
    conditions = []
    if filters.task_name and filters.task_name.strip():
        conditions.append(Episode.task_name == normalize_task_name(filters.task_name))
    if filters.quality:
        conditions.append(Episode.quality == filters.quality)
    if filters.robot_id and filters.robot_id.strip():
        conditions.append(Episode.robot_id == filters.robot_id.strip().lower())
    if filters.search and filters.search.strip():
        conditions.append(Episode.episode_id.like(f"{_escape_like(filters.search.strip().upper())}%", escape="\\"))
    if filters.available_only:
        conditions.append(Episode.quality.in_(ASSIGNABLE_QUALITIES))
        conditions.append(Assignment.id.is_(None))

    # Assignment is unique per episode, so this LEFT JOIN never multiplies rows.
    query = (
        select(Episode, Assignment.request_id)
        .outerjoin(Assignment, Assignment.episode_id == Episode.id)
        .where(*conditions)
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(
        query.order_by(Episode.recorded_at.desc(), Episode.id.desc()).offset(offset).limit(limit)
    ).all()
    return [(episode, request_id) for episode, request_id in rows], total


def episode_facets(db: Session) -> tuple[list[str], list[str]]:
    robots = db.scalars(select(Robot.id).order_by(Robot.id)).all()
    task_names = db.scalars(_DISTINCT_TASK_NAMES).all()
    return list(robots), list(task_names)
