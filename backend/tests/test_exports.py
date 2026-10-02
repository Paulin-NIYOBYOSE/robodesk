"""The background export job: claiming, retries, idempotency and stale workers."""

import random
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Assignment, ExportStatus
from app.services.exports import (
    LEASE,
    MAX_ATTEMPTS,
    ClaimedJob,
    ExportFailed,
    claim_next_job,
    finish_job,
    process_one,
    retry_delay,
    simulate_export,
)
from tests.helpers import auth

T0 = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)


@pytest.fixture
def assign(db, operator, client_a, make_request, make_episode):
    """Create assignments whose export becomes due at T0."""

    def factory(count: int = 1) -> list[Assignment]:
        request = make_request(client_a, status="in_progress", episodes_requested=count)
        rows = [
            Assignment(request_id=request.id, episode_id=make_episode().id, assigned_by_id=operator.id,
                       export_next_attempt_at=T0)
            for _ in range(count)
        ]
        db.add_all(rows)
        db.commit()
        return rows

    return factory


def state(assignment_id: int) -> Assignment:
    with SessionLocal() as session:
        return session.get(Assignment, assignment_id)


def test_new_assignment_starts_as_a_pending_export(api, db, operator, client_a, make_request, make_episode):
    request = make_request(client_a, status="in_progress", episodes_requested=1)
    episode = make_episode()
    api.post(f"/api/requests/{request.id}/assignments", json={"episode_ids": [episode.id]}, headers=auth(operator))
    [item] = api.get(f"/api/requests/{request.id}/assignments", headers=auth(client_a)).json()["items"]
    assert (item["export_status"], item["export_attempts"], item["exported_at"]) == ("pending", 0, None)


def test_claim_marks_running_and_is_exclusive(db, assign):
    [assignment] = assign()
    job = claim_next_job(db, T0)
    assert job.attempt == 1
    current = state(assignment.id)
    assert current.export_status == ExportStatus.RUNNING
    assert current.export_lease_expires_at == T0 + LEASE
    assert claim_next_job(db, T0) is None  # nobody else gets a running job


def test_success_is_final(db, assign):
    [assignment] = assign()
    job = claim_next_job(db, T0)
    assert finish_job(db, job, None, T0 + timedelta(seconds=3))
    current = state(assignment.id)
    assert current.export_status == ExportStatus.SUCCEEDED
    assert current.exported_at == T0 + timedelta(seconds=3)
    assert claim_next_job(db, T0 + timedelta(days=1)) is None  # never exported twice


def test_failure_is_retried_after_a_backoff(db, assign):
    [assignment] = assign()
    job = claim_next_job(db, T0)
    finish_job(db, job, "boom", T0)
    current = state(assignment.id)
    assert (current.export_status, current.export_error) == (ExportStatus.PENDING, "boom")
    assert claim_next_job(db, T0) is None  # not due yet
    retry = claim_next_job(db, T0 + retry_delay(1))
    assert retry.attempt == 2


def test_gives_up_after_max_attempts(db, assign):
    [assignment] = assign()
    now = T0
    for _ in range(MAX_ATTEMPTS):
        job = claim_next_job(db, now)
        finish_job(db, job, "boom", now)
        now += timedelta(minutes=5)
    assert state(assignment.id).export_status == ExportStatus.FAILED
    assert claim_next_job(db, now) is None


def test_expired_lease_is_reclaimed_and_the_stale_worker_cannot_overwrite(db, assign):
    [assignment] = assign()
    stale = claim_next_job(db, T0)  # worker A hangs...
    fresh = claim_next_job(db, T0 + LEASE + timedelta(seconds=1))  # ...so worker B takes over
    assert fresh.attempt == 2
    assert finish_job(db, fresh, None, T0 + LEASE + timedelta(seconds=4))
    # Worker A wakes up and reports a failure for its old attempt: ignored.
    assert not finish_job(db, stale, "late failure", T0 + LEASE + timedelta(seconds=9))
    assert state(assignment.id).export_status == ExportStatus.SUCCEEDED


def test_finishing_after_unassignment_is_a_no_op(db, assign):
    [assignment] = assign()
    job = claim_next_job(db, T0)
    db.delete(db.get(Assignment, assignment.id))
    db.commit()
    assert not finish_job(db, job, None, T0)


def test_concurrent_workers_never_claim_the_same_job(assign):
    first, second = assign(2)
    with SessionLocal() as worker_a, SessionLocal() as worker_b:
        # Worker A has locked the first due job but not committed yet...
        locked = worker_a.scalar(
            select(Assignment).where(Assignment.id == first.id).with_for_update(skip_locked=True)
        )
        assert locked is not None
        # ...worker B skips it instead of waiting, and takes the next one.
        job = claim_next_job(worker_b, T0)
        assert job.assignment_id == second.id
        worker_a.rollback()


def test_process_one_runs_the_whole_cycle(assign):
    [assignment] = assign()

    def failing_export(job: ClaimedJob) -> None:
        raise ExportFailed("disk full")

    clock = lambda: T0  # noqa: E731
    job, error = process_one(SessionLocal, export=failing_export, clock=clock)
    assert (job.attempt, error) == (1, "disk full")
    assert process_one(SessionLocal, export=lambda job: None, clock=lambda: T0 + timedelta(minutes=1)) is not None
    assert state(assignment.id).export_status == ExportStatus.SUCCEEDED
    assert process_one(SessionLocal, clock=lambda: T0 + timedelta(hours=1)) is None


def test_simulated_export_fails_about_twenty_percent_of_the_time():
    rng = random.Random(42)
    job = ClaimedJob(assignment_id=1, request_id=1, episode_id=1, attempt=1)
    delays: list[float] = []
    failures = 0
    for _ in range(2000):
        try:
            simulate_export(job, sleep=delays.append, rng=rng)
        except ExportFailed:
            failures += 1
    assert 0.17 < failures / 2000 < 0.23
    assert 2.0 <= min(delays) and max(delays) <= 5.0
    assert job.destination == "exports/request-1/episode-1"  # same target on every retry


def test_operator_can_retry_a_failed_export(api, db, operator, client_a, assign):
    [assignment] = assign()
    url = f"/api/requests/{assignment.request_id}/assignments/{assignment.episode_id}/retry-export"
    assert api.post(url, headers=auth(operator)).status_code == 409  # still pending

    db.execute(
        Assignment.__table__.update()
        .where(Assignment.id == assignment.id)
        .values(export_status=ExportStatus.FAILED, export_attempts=MAX_ATTEMPTS)
    )
    db.commit()
    assert api.post(url, headers=auth(client_a)).status_code == 403
    assert api.post(url, headers=auth(operator)).status_code == 204
    current = state(assignment.id)
    assert (current.export_status, current.export_attempts) == (ExportStatus.PENDING, 0)
