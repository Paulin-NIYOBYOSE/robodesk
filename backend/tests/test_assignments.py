import threading
import time

import pytest
from sqlalchemy import func, select

from app.core.errors import ConflictError
from app.db.session import SessionLocal
from app.models import Assignment, EpisodeQuality
from app.services.assignments import assign_episodes
from tests.helpers import auth

GOOD, USABLE, BAD = EpisodeQuality.GOOD, EpisodeQuality.USABLE, EpisodeQuality.BAD


def assign(api, user, request_id, *episode_ids):
    return api.post(
        f"/api/requests/{request_id}/assignments", json={"episode_ids": list(episode_ids)}, headers=auth(user)
    )


def deliver(api, user, request_id):
    return api.post(f"/api/requests/{request_id}/transition", json={"to_status": "delivered"}, headers=auth(user))


@pytest.fixture
def in_progress(make_request, client_a):
    return make_request(client_a, status="in_progress", episodes_requested=2)


@pytest.mark.parametrize("quality", [GOOD, USABLE])
def test_good_and_usable_episodes_can_be_assigned(api, operator, in_progress, make_episode, quality):
    response = assign(api, operator, in_progress.id, make_episode(quality).id)
    assert response.status_code == 200
    assert response.json() == {"assigned": 1, "assigned_count": 1, "episodes_requested": 2}


def test_bad_episode_cannot_be_assigned(api, operator, in_progress, make_episode):
    bad = make_episode(BAD)
    response = assign(api, operator, in_progress.id, bad.id)
    assert response.status_code == 409
    assert bad.episode_id in response.json()["detail"]


def test_assignment_is_all_or_nothing(api, db, operator, in_progress, make_episode):
    response = assign(api, operator, in_progress.id, make_episode(GOOD).id, make_episode(BAD).id)
    assert response.status_code == 409
    assert db.scalar(select(func.count(Assignment.id))) == 0


def test_episode_cannot_be_assigned_twice(api, operator, client_b, in_progress, make_request, make_episode):
    episode = make_episode(GOOD)
    assert assign(api, operator, in_progress.id, episode.id).status_code == 200

    again = assign(api, operator, in_progress.id, episode.id)
    assert again.status_code == 409

    other_request = make_request(client_b, status="in_progress")
    elsewhere = assign(api, operator, other_request.id, episode.id)
    assert elsewhere.status_code == 409
    assert elsewhere.json()["detail"] == f"Episode {episode.episode_id} is already assigned to request #{in_progress.id}"


def test_unknown_episode_is_404(api, operator, in_progress):
    assert assign(api, operator, in_progress.id, 424242).status_code == 404


def test_assignments_only_while_in_progress(api, operator, client_a, make_request, make_episode):
    for status in ("submitted", "delivered", "accepted", "rejected"):
        request = make_request(client_a, status=status)
        assert assign(api, operator, request.id, make_episode(GOOD).id).status_code == 409, status


def test_cannot_assign_more_than_requested(api, operator, in_progress, make_episode):
    episodes = [make_episode(GOOD).id for _ in range(3)]
    response = assign(api, operator, in_progress.id, *episodes)
    assert response.status_code == 409
    assert "needs 2 more" in response.json()["detail"]


def test_delivery_requires_enough_assigned_episodes(api, operator, in_progress, make_episode):
    assign(api, operator, in_progress.id, make_episode(GOOD).id)
    too_few = deliver(api, operator, in_progress.id)
    assert too_few.status_code == 409
    assert "(1 assigned)" in too_few.json()["detail"]

    assign(api, operator, in_progress.id, make_episode(USABLE).id)
    assert deliver(api, operator, in_progress.id).status_code == 200


def test_unassigning_frees_the_episode(api, operator, client_b, in_progress, make_request, make_episode):
    episode = make_episode(GOOD)
    assign(api, operator, in_progress.id, episode.id)
    response = api.delete(f"/api/requests/{in_progress.id}/assignments/{episode.id}", headers=auth(operator))
    assert response.status_code == 204

    other_request = make_request(client_b, status="in_progress")
    assert assign(api, operator, other_request.id, episode.id).status_code == 200


def test_delivered_request_is_frozen(api, operator, client_a, make_request, make_episode, db):
    request = make_request(client_a, status="delivered", episodes_requested=1)
    episode = make_episode(GOOD)
    db.add(Assignment(request_id=request.id, episode_id=episode.id, assigned_by_id=operator.id))
    db.commit()
    response = api.delete(f"/api/requests/{request.id}/assignments/{episode.id}", headers=auth(operator))
    assert response.status_code == 409


def test_client_sees_assigned_episodes_of_own_request(api, operator, client_a, in_progress, make_episode):
    episode = make_episode(GOOD)
    assign(api, operator, in_progress.id, episode.id)
    page = api.get(f"/api/requests/{in_progress.id}/assignments", headers=auth(client_a)).json()
    assert page["total"] == 1
    assert page["items"][0]["episode"]["episode_id"] == episode.episode_id
    assert page["items"][0]["episode"]["assigned_request_id"] == in_progress.id


def test_concurrent_assignment_of_one_episode_has_a_single_winner(operator, client_a, client_b, make_request, make_episode):
    """Two operators assign the same episode to different requests at the same moment.

    The first transaction holds an uncommitted assignment row; the second passes the
    application-level "already assigned?" check (it cannot see uncommitted rows) and
    blocks on the unique index. When the first commits, the second must fail cleanly.
    """
    episode = make_episode(GOOD)
    first_request = make_request(client_a, status="in_progress")
    second_request = make_request(client_b, status="in_progress")
    outcome: dict[str, str] = {}

    def second_operator() -> None:
        with SessionLocal() as session:
            try:
                assign_episodes(session, second_request.id, [episode.id], operator)
                outcome["result"] = "assigned"
            except ConflictError as exc:
                outcome["result"] = exc.message

    with SessionLocal() as first:
        first.add(Assignment(request_id=first_request.id, episode_id=episode.id, assigned_by_id=operator.id))
        first.flush()  # row written but not committed
        racer = threading.Thread(target=second_operator)
        racer.start()
        time.sleep(0.5)  # let the second transaction reach the unique index and wait
        first.commit()
        racer.join(timeout=10)

    # Depending on timing the loser sees either the pre-check or the constraint; never success.
    assert outcome["result"] != "assigned"
    assert "assigned" in outcome["result"]
    with SessionLocal() as check:
        owners = check.scalars(select(Assignment.request_id).where(Assignment.episode_id == episode.id)).all()
    assert owners == [first_request.id]


def test_episode_browser_marks_availability(api, operator, in_progress, make_episode):
    taken = make_episode(GOOD, task_name="pick cup")
    make_episode(GOOD, task_name="pick cup")
    make_episode(BAD, task_name="pick cup")
    make_episode(USABLE, task_name="fold towel")
    assign(api, operator, in_progress.id, taken.id)

    everything = api.get("/api/episodes", headers=auth(operator)).json()
    assert everything["total"] == 4
    by_id = {e["id"]: e for e in everything["items"]}
    assert by_id[taken.id]["assigned_request_id"] == in_progress.id

    available = api.get("/api/episodes", params={"available": True, "task_name": "Pick Cup"}, headers=auth(operator)).json()
    assert available["total"] == 1  # excludes the assigned one and the bad one

    usable = api.get("/api/episodes", params={"quality": "usable"}, headers=auth(operator)).json()
    assert [e["task_name"] for e in usable["items"]] == ["fold towel"]


def test_episode_search_and_facets(api, operator, make_episode):
    make_episode(episode_id="EP-00100", task_name="wipe table")
    make_episode(episode_id="EP-00200", task_name="pick cup")
    found = api.get("/api/episodes", params={"search": "ep-001"}, headers=auth(operator)).json()
    assert [e["episode_id"] for e in found["items"]] == ["EP-00100"]
    # LIKE wildcards in the search term are treated literally.
    assert api.get("/api/episodes", params={"search": "%"}, headers=auth(operator)).json()["total"] == 0

    facets = api.get("/api/episodes/facets", headers=auth(operator)).json()
    assert facets["task_names"] == ["pick cup", "wipe table"]
    assert "arm-01" in facets["robots"]
