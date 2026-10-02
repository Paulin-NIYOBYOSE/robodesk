from datetime import date, timedelta

from app.models import Assignment, EpisodeQuality
from tests.helpers import auth


def new_request(**overrides):
    return {
        "task_name": "  Pick   CUP ",
        "episodes_requested": 2,
        "deadline": (date.today() + timedelta(days=14)).isoformat(),
        "notes": "Bright lighting only",
        **overrides,
    }


def transition(api, user, request_id, to_status, comment=None):
    return api.post(
        f"/api/requests/{request_id}/transition", json={"to_status": to_status, "comment": comment}, headers=auth(user)
    )


def test_client_creates_request_and_history_records_submission(api, client_a):
    response = api.post("/api/requests", json=new_request(), headers=auth(client_a))
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "submitted"
    assert body["task_name"] == "pick cup"  # normalised like imported episodes
    assert body["assigned_count"] == 0
    assert body["client"]["id"] == client_a.id
    assert body["allowed_transitions"] == []
    [entry] = body["history"]
    assert entry["previous_status"] is None
    assert entry["new_status"] == "submitted"
    assert entry["changed_by"]["id"] == client_a.id


def test_request_validation(api, client_a):
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    for payload in (
        new_request(deadline=yesterday),
        new_request(episodes_requested=0),
        new_request(task_name="   "),
        new_request(status="accepted"),  # unknown fields are refused, not ignored
        new_request(client_id=999),
    ):
        assert api.post("/api/requests", json=payload, headers=auth(client_a)).status_code == 422, payload


def test_full_lifecycle_with_rework_is_audited(api, client_a, operator, make_episode):
    request_id = api.post("/api/requests", json=new_request(), headers=auth(client_a)).json()["id"]
    episodes = [make_episode(EpisodeQuality.GOOD).id, make_episode(EpisodeQuality.USABLE).id]

    assert transition(api, operator, request_id, "in_progress").status_code == 200
    assign = api.post(f"/api/requests/{request_id}/assignments", json={"episode_ids": episodes}, headers=auth(operator))
    assert assign.status_code == 200
    assert transition(api, operator, request_id, "delivered").status_code == 200

    reject = api.post(f"/api/requests/{request_id}/reject", json={"reason": "Two clips are blurry"}, headers=auth(client_a))
    assert reject.status_code == 200
    assert reject.json()["status"] == "rejected"

    assert transition(api, operator, request_id, "in_progress").status_code == 200
    assert transition(api, operator, request_id, "delivered").status_code == 200
    accept = api.post(f"/api/requests/{request_id}/accept", headers=auth(client_a))
    assert accept.status_code == 200

    history = accept.json()["history"]
    assert [(h["previous_status"], h["new_status"]) for h in history] == [
        (None, "submitted"),
        ("submitted", "in_progress"),
        ("in_progress", "delivered"),
        ("delivered", "rejected"),
        ("rejected", "in_progress"),
        ("in_progress", "delivered"),
        ("delivered", "accepted"),
    ]
    actors = [h["changed_by"]["id"] for h in history]
    assert actors == [client_a.id, operator.id, operator.id, client_a.id, operator.id, operator.id, client_a.id]
    assert history[3]["comment"] == "Two clips are blurry"
    assert accept.json()["allowed_transitions"] == []


def test_invalid_transitions_are_rejected_server_side(api, client_a, operator, make_request):
    request = make_request(client_a)
    assert transition(api, operator, request.id, "delivered").status_code == 409  # skips in_progress
    assert transition(api, operator, request.id, "accepted").status_code == 409
    assert transition(api, operator, request.id, "submitted").status_code == 409

    accepted = make_request(client_a, status="accepted")
    for target in ("submitted", "in_progress", "delivered", "rejected"):
        assert transition(api, operator, accepted.id, target).status_code == 409


def test_only_the_owning_role_may_make_each_move(api, client_a, operator, admin, make_request):
    submitted = make_request(client_a)
    assert transition(api, client_a, submitted.id, "in_progress").status_code == 403

    delivered = make_request(client_a, status="delivered")
    assert transition(api, operator, delivered.id, "accepted").status_code == 403
    assert transition(api, admin, delivered.id, "rejected", comment="nope").status_code == 403
    assert api.post(f"/api/requests/{delivered.id}/accept", headers=auth(operator)).status_code == 403
    # The owning client may also use the generic endpoint.
    assert transition(api, client_a, delivered.id, "accepted").status_code == 200


def test_admin_can_run_operator_steps(api, client_a, admin, make_request):
    request = make_request(client_a)
    assert transition(api, admin, request.id, "in_progress").status_code == 200


def test_rejection_requires_a_reason(api, client_a, make_request):
    request = make_request(client_a, status="delivered")
    assert api.post(f"/api/requests/{request.id}/reject", json={"reason": " "}, headers=auth(client_a)).status_code == 422
    assert transition(api, client_a, request.id, "rejected").status_code == 422
    assert api.get(f"/api/requests/{request.id}", headers=auth(client_a)).json()["status"] == "delivered"


def test_cannot_deliver_twice(api, db, client_a, operator, make_request, make_episode):
    request = make_request(client_a, status="in_progress", episodes_requested=1)
    db.add(Assignment(request_id=request.id, episode_id=make_episode().id, assigned_by_id=operator.id))
    db.commit()
    assert transition(api, operator, request.id, "delivered").status_code == 200
    # A second operator clicking "deliver" on a stale screen gets a clean conflict.
    assert transition(api, operator, request.id, "delivered").status_code == 409


def test_allowed_transitions_reflect_the_viewer(api, client_a, operator, make_request):
    request = make_request(client_a, status="delivered")
    assert api.get(f"/api/requests/{request.id}", headers=auth(client_a)).json()["allowed_transitions"] == [
        "accepted",
        "rejected",
    ]
    assert api.get(f"/api/requests/{request.id}", headers=auth(operator)).json()["allowed_transitions"] == []


def test_list_filters_and_pagination(api, client_a, client_b, operator, make_request):
    for _ in range(3):
        make_request(client_a)
    make_request(client_a, status="in_progress", task_name="fold towel")
    make_request(client_b)

    everything = api.get("/api/requests", params={"page_size": 2}, headers=auth(operator)).json()
    assert everything["total"] == 5
    assert len(everything["items"]) == 2

    in_progress = api.get("/api/requests", params={"status": "in_progress"}, headers=auth(operator)).json()
    assert [r["task_name"] for r in in_progress["items"]] == ["fold towel"]

    towels = api.get("/api/requests", params={"task_name": "TOWEL"}, headers=auth(operator)).json()
    assert towels["total"] == 1

    by_client = api.get("/api/requests", params={"client_id": client_b.id}, headers=auth(operator)).json()
    assert by_client["total"] == 1


def test_summary_counts_by_status(api, client_a, client_b, operator, make_request):
    make_request(client_a)
    make_request(client_a, status="delivered")
    make_request(client_b)

    staff = api.get("/api/requests/summary", headers=auth(operator)).json()
    assert staff["total"] == 3
    assert staff["by_status"]["submitted"] == 2
    assert staff["by_status"]["accepted"] == 0

    own = api.get("/api/requests/summary", headers=auth(client_a)).json()
    assert own["total"] == 2
