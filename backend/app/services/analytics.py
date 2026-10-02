"""Operational analytics. Every figure is aggregated by PostgreSQL; Python only ever
receives the (small) aggregated result, never raw episodes.

Dates are interpreted in UTC. The range is inclusive: ``to=2026-09-30`` covers the
whole of 30 September.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.core.errors import InvalidInputError
from app.models import DatasetRequest, Episode, EpisodeQuality, RequestStatus, RequestStatusHistory

MAX_RANGE_DAYS = 366
TOP_TASKS_LIMIT = 5


@dataclass(frozen=True)
class Fulfilment:
    counts_by_status: dict[RequestStatus, int]
    median_seconds_to_delivery: float | None
    delivered_requests: int


@dataclass(frozen=True)
class Analytics:
    episodes_per_day_by_robot: list[tuple[date, str, int]]
    fulfilment: Fulfilment
    top_tasks: list[tuple[str, int]]


def _bounds(start: date, end: date) -> tuple[datetime, datetime]:
    """Half-open UTC interval [start 00:00, day after end 00:00) — index-friendly."""
    if end < start:
        raise InvalidInputError("'to' must be on or after 'from'")
    if (end - start).days >= MAX_RANGE_DAYS:
        raise InvalidInputError(f"The date range can span at most {MAX_RANGE_DAYS} days")
    return datetime.combine(start, time.min, UTC), datetime.combine(end + timedelta(days=1), time.min, UTC)


def episodes_per_day_by_robot(db: Session, start_at: datetime, end_at: datetime) -> list[tuple[date, str, int]]:
    # Served by ix_episodes_recorded_at_robot_id (range scan, index-only when vacuumed).
    day = cast(func.timezone("UTC", Episode.recorded_at), Date).label("day")
    rows = db.execute(
        select(day, Episode.robot_id, func.count())
        .where(Episode.recorded_at >= start_at, Episode.recorded_at < end_at)
        .group_by(day, Episode.robot_id)
        .order_by(day, Episode.robot_id)
    ).all()
    return [(row_day, robot_id, count) for row_day, robot_id, count in rows]


def request_fulfilment(db: Session, start_at: datetime, end_at: datetime) -> Fulfilment:
    """For requests submitted in the range: counts by current status, and the median time
    from submission to *first* delivery (a rejected-then-redelivered request is measured
    to its first delivery; the rework shows up in the status counts)."""
    submitted_in_range = (DatasetRequest.created_at >= start_at, DatasetRequest.created_at < end_at)

    counts = dict(
        db.execute(
            select(DatasetRequest.status, func.count()).where(*submitted_in_range).group_by(DatasetRequest.status)
        ).all()
    )

    first_delivery = (
        select(
            RequestStatusHistory.request_id,
            func.min(RequestStatusHistory.changed_at).label("delivered_at"),
        )
        .where(RequestStatusHistory.new_status == RequestStatus.DELIVERED)
        .group_by(RequestStatusHistory.request_id)
        .subquery()
    )
    seconds_to_delivery = func.extract("epoch", first_delivery.c.delivered_at - DatasetRequest.created_at)
    median, delivered = db.execute(
        select(func.percentile_cont(0.5).within_group(seconds_to_delivery), func.count())
        .select_from(DatasetRequest)
        .join(first_delivery, first_delivery.c.request_id == DatasetRequest.id)
        .where(*submitted_in_range)
    ).one()

    return Fulfilment(
        counts_by_status={status: counts.get(status, 0) for status in RequestStatus},
        median_seconds_to_delivery=float(median) if median is not None else None,
        delivered_requests=delivered,
    )


def top_tasks_by_good_episodes(db: Session, start_at: datetime, end_at: datetime) -> list[tuple[str, int]]:
    # Served by the partial index ix_episodes_good_recorded_at_task_name.
    good_count = func.count().label("good_episodes")
    rows = db.execute(
        select(Episode.task_name, good_count)
        .where(
            Episode.quality == EpisodeQuality.GOOD,
            Episode.recorded_at >= start_at,
            Episode.recorded_at < end_at,
        )
        .group_by(Episode.task_name)
        .order_by(good_count.desc(), Episode.task_name)
        .limit(TOP_TASKS_LIMIT)
    ).all()
    return [(task_name, count) for task_name, count in rows]


def analytics_for_range(db: Session, start: date, end: date) -> Analytics:
    start_at, end_at = _bounds(start, end)
    return Analytics(
        episodes_per_day_by_robot=episodes_per_day_by_robot(db, start_at, end_at),
        fulfilment=request_fulfilment(db, start_at, end_at),
        top_tasks=top_tasks_by_good_episodes(db, start_at, end_at),
    )
