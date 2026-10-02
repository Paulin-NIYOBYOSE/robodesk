from datetime import UTC, date, datetime, timedelta

import pytest

from app.models import DatasetRequest, EpisodeQuality, RequestStatus, RequestStatusHistory
from tests.helpers import auth

GOOD, USABLE, BAD = EpisodeQuality.GOOD, EpisodeQuality.USABLE, EpisodeQuality.BAD


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


def get_analytics(api, user, start="2026-09-01", end="2026-09-02"):
    return api.get("/api/analytics", params={"from": start, "to": end}, headers=auth(user))


def test_episodes_per_day_per_robot_with_inclusive_utc_range(api, operator, make_episode):
    make_episode(robot_id="arm-01", recorded_at=utc(2026, 9, 1, 0, 0))
    make_episode(robot_id="arm-01", recorded_at=utc(2026, 9, 1, 18, 0))
    make_episode(robot_id="arm-02", recorded_at=utc(2026, 9, 1, 9, 0))
    make_episode(robot_id="arm-01", recorded_at=utc(2026, 9, 2, 23, 59, 59))  # last second of `to`
    # 23:30 at UTC-2 on 1 Sept is 01:30 UTC on 2 Sept: buckets are UTC days.
    make_episode(robot_id="arm-02", recorded_at=datetime.fromisoformat("2026-09-01T23:30:00-02:00"))
    make_episode(robot_id="arm-01", recorded_at=utc(2026, 8, 31, 23, 59, 59))  # before range
    make_episode(robot_id="arm-01", recorded_at=utc(2026, 9, 3, 0, 0))  # after range

    body = get_analytics(api, operator).json()
    assert body["from"] == "2026-09-01" and body["to"] == "2026-09-02"
    assert body["episodes_per_day_by_robot"] == [
        {"date": "2026-09-01", "robot_id": "arm-01", "count": 2},
        {"date": "2026-09-01", "robot_id": "arm-02", "count": 1},
        {"date": "2026-09-02", "robot_id": "arm-01", "count": 1},
        {"date": "2026-09-02", "robot_id": "arm-02", "count": 1},
    ]


def test_top_five_tasks_count_only_good_episodes(api, operator, make_episode):
    in_range = utc(2026, 9, 1, 12)
    good_counts = {"pick cup": 4, "fold towel": 3, "open drawer": 3, "pour water": 2, "wipe table": 1, "stack blocks": 1}
    for task, n in good_counts.items():
        for _ in range(n):
            make_episode(GOOD, task_name=task, recorded_at=in_range)
    for _ in range(10):  # lots of non-good episodes must not count
        make_episode(BAD, task_name="stack blocks", recorded_at=in_range)
        make_episode(USABLE, task_name="wipe table", recorded_at=in_range)
    for _ in range(10):  # good, but outside the range
        make_episode(GOOD, task_name="wipe table", recorded_at=utc(2026, 7, 1))

    top = get_analytics(api, operator).json()["top_tasks_by_good_episodes"]
    assert top == [
        {"task_name": "pick cup", "good_episodes": 4},
        {"task_name": "fold towel", "good_episodes": 3},  # ties ordered by name
        {"task_name": "open drawer", "good_episodes": 3},
        {"task_name": "pour water", "good_episodes": 2},
        {"task_name": "stack blocks", "good_episodes": 1},
    ]


@pytest.fixture
def add_request(db, client_a, operator):
    """Insert a request submitted at ``created_at`` and delivered after each of ``deliveries``."""

    def factory(created_at: datetime, status: RequestStatus, deliveries: tuple[timedelta, ...] = ()):
        request = DatasetRequest(
            client_id=client_a.id,
            task_name="pick cup",
            episodes_requested=1,
            deadline=date(2026, 12, 31),
            status=status,
            created_at=created_at,
        )
        db.add(request)
        db.flush()
        db.add(RequestStatusHistory(request_id=request.id, new_status=RequestStatus.SUBMITTED,
                                    changed_by_id=client_a.id, changed_at=created_at))
        for after in deliveries:
            db.add(RequestStatusHistory(request_id=request.id, previous_status=RequestStatus.IN_PROGRESS,
                                        new_status=RequestStatus.DELIVERED, changed_by_id=operator.id,
                                        changed_at=created_at + after))
        db.commit()

    return factory


def test_request_fulfilment_counts_and_median(api, operator, add_request):
    submitted = utc(2026, 9, 1, 8)
    hour = timedelta(hours=1)
    add_request(submitted, RequestStatus.ACCEPTED, deliveries=(1 * hour,))
    add_request(submitted, RequestStatus.DELIVERED, deliveries=(2 * hour,))
    # Rejected then re-delivered: measured to the *first* delivery (10h, not 30h).
    add_request(submitted, RequestStatus.DELIVERED, deliveries=(10 * hour, 30 * hour))
    add_request(submitted, RequestStatus.IN_PROGRESS)
    add_request(submitted, RequestStatus.SUBMITTED)
    add_request(utc(2026, 8, 1), RequestStatus.ACCEPTED, deliveries=(100 * hour,))  # outside range

    fulfilment = get_analytics(api, operator).json()["request_fulfilment"]
    assert fulfilment["counts_by_status"] == {
        "submitted": 1, "in_progress": 1, "delivered": 2, "accepted": 1, "rejected": 0,
    }
    assert fulfilment["total"] == 5
    assert fulfilment["delivered_requests"] == 3
    assert fulfilment["median_seconds_to_delivery"] == 2 * 3600


def test_median_interpolates_for_an_even_count(api, operator, add_request):
    submitted = utc(2026, 9, 1, 8)
    add_request(submitted, RequestStatus.DELIVERED, deliveries=(timedelta(hours=1),))
    add_request(submitted, RequestStatus.DELIVERED, deliveries=(timedelta(hours=4),))
    fulfilment = get_analytics(api, operator).json()["request_fulfilment"]
    assert fulfilment["median_seconds_to_delivery"] == 2.5 * 3600


def test_empty_range_returns_zeros_not_errors(api, operator):
    body = get_analytics(api, operator).json()
    assert body["episodes_per_day_by_robot"] == []
    assert body["top_tasks_by_good_episodes"] == []
    assert body["request_fulfilment"]["median_seconds_to_delivery"] is None
    assert body["request_fulfilment"]["total"] == 0


@pytest.mark.parametrize(
    ("params", "status"),
    [
        ({"from": "2026-09-02", "to": "2026-09-01"}, 422),  # inverted
        ({"from": "2025-01-01", "to": "2026-09-01"}, 422),  # longer than a year
        ({"from": "2026-09-01"}, 422),  # missing `to`
        ({"from": "yesterday", "to": "2026-09-01"}, 422),
    ],
)
def test_invalid_ranges_are_rejected(api, operator, params, status):
    assert api.get("/api/analytics", params=params, headers=auth(operator)).status_code == status


def test_analytics_is_staff_only(api, client_a, admin):
    assert get_analytics(api, client_a).status_code == 403
    assert get_analytics(api, admin).status_code == 200
