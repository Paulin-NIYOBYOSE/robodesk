"""Background export of assigned episodes (the stretch item).

Each assignment carries its own export job state. Workers (``python -m app.worker``)
run this loop, and any number of them can run side by side:

1. **claim** — in a short transaction, lock one due job with ``FOR UPDATE SKIP LOCKED``
   (two workers never get the same row), mark it ``running``, bump the attempt counter
   and give it a lease;
2. **export** — outside any transaction, do the slow work (simulated: 2–5 s, fails ~20%);
3. **finish** — record the outcome, but only if the job is still ``running`` with the
   *same attempt number*. A worker whose lease expired (and whose job was re-claimed by
   someone else) therefore cannot overwrite the newer attempt's result.

Retries back off exponentially and stop after ``MAX_ATTEMPTS``. A worker that dies
mid-export simply lets its lease expire; the job becomes claimable again. The export
target is derived from (request, episode), so a retry overwrites the same artefact
rather than producing a duplicate — the job is idempotent.
"""

import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select, update
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models import Assignment, ExportStatus, User
from app.services.requests import get_request_for_user

MAX_ATTEMPTS = 3
LEASE = timedelta(seconds=60)
FAILURE_RATE = 0.2
EXPORT_SECONDS = (2.0, 5.0)


class ExportFailed(Exception):
    pass


@dataclass(frozen=True)
class ClaimedJob:
    assignment_id: int
    request_id: int
    episode_id: int
    attempt: int

    @property
    def destination(self) -> str:
        """Deterministic target: retrying writes the same object, never a second copy."""
        return f"exports/request-{self.request_id}/episode-{self.episode_id}"


def retry_delay(attempt: int) -> timedelta:
    """2s, 4s, 8s ... capped at one minute."""
    return timedelta(seconds=min(60, 2**attempt))


def claim_next_job(db: Session, now: datetime) -> ClaimedJob | None:
    due = or_(
        and_(Assignment.export_status == ExportStatus.PENDING, Assignment.export_next_attempt_at <= now),
        # A worker died (or hung) mid-export: its lease ran out, so the job is up for grabs.
        and_(Assignment.export_status == ExportStatus.RUNNING, Assignment.export_lease_expires_at < now),
    )
    job = db.scalar(
        select(Assignment)
        .where(due)
        .order_by(Assignment.export_next_attempt_at, Assignment.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if job is None:
        db.rollback()
        return None
    job.export_status = ExportStatus.RUNNING
    job.export_attempts += 1
    job.export_lease_expires_at = now + LEASE
    claimed = ClaimedJob(job.id, job.request_id, job.episode_id, job.export_attempts)
    db.commit()
    return claimed


def finish_job(db: Session, job: ClaimedJob, error: str | None, now: datetime) -> bool:
    """Record an attempt's outcome. Returns False if this attempt no longer owns the job
    (lease expired and re-claimed, or the episode was unassigned meanwhile)."""
    if error is None:
        values = {"export_status": ExportStatus.SUCCEEDED, "exported_at": now, "export_error": None}
    elif job.attempt >= MAX_ATTEMPTS:
        values = {"export_status": ExportStatus.FAILED, "export_error": error}
    else:
        values = {
            "export_status": ExportStatus.PENDING,
            "export_error": error,
            "export_next_attempt_at": now + retry_delay(job.attempt),
        }
    result = db.execute(
        update(Assignment)
        .where(
            Assignment.id == job.assignment_id,
            Assignment.export_status == ExportStatus.RUNNING,
            Assignment.export_attempts == job.attempt,
        )
        .values(export_lease_expires_at=None, **values)
    )
    db.commit()
    return result.rowcount == 1


def simulate_export(
    job: ClaimedJob,
    *,
    sleep: Callable[[float], None] = time.sleep,
    rng: random.Random | None = None,
) -> None:
    """Stand-in for copying the episode to the client's delivery bucket."""
    rng = rng or random.Random()
    sleep(rng.uniform(*EXPORT_SECONDS))
    if rng.random() < FAILURE_RATE:
        raise ExportFailed(f"Simulated transient failure writing {job.destination}")


def process_one(
    session_factory: Callable[[], Session],
    *,
    export: Callable[[ClaimedJob], None] = simulate_export,
    clock: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> tuple[ClaimedJob, str | None] | None:
    """Claim, run and finish a single job. Returns None when nothing is due."""
    with session_factory() as db:
        job = claim_next_job(db, clock())
    if job is None:
        return None
    error = None
    try:
        export(job)
    except ExportFailed as exc:
        error = str(exc)
    with session_factory() as db:
        finish_job(db, job, error, clock())
    return job, error


def retry_export(db: Session, request_id: int, episode_id: int, actor: User) -> None:
    """Operator action: give a permanently failed export a fresh set of attempts."""
    request = get_request_for_user(db, request_id, actor)
    assignment = db.scalar(
        select(Assignment)
        .where(Assignment.request_id == request.id, Assignment.episode_id == episode_id)
        .with_for_update()
    )
    if assignment is None:
        raise NotFoundError("This episode is not assigned to this request")
    if assignment.export_status != ExportStatus.FAILED:
        raise ConflictError("Only failed exports can be retried")
    assignment.export_status = ExportStatus.PENDING
    assignment.export_attempts = 0
    assignment.export_error = None
    assignment.export_next_attempt_at = datetime.now(UTC)
    db.commit()
