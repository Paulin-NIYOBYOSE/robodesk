"""Server-side authorization: the API must refuse what the UI merely hides."""

import pytest

from app.main import app
from tests.helpers import auth

PUBLIC_ENDPOINTS = {("POST", "/api/auth/login"), ("GET", "/health")}


def _all_endpoints() -> list[tuple[str, str]]:
    endpoints = []
    for path, operations in app.openapi()["paths"].items():
        concrete = path.replace("{request_id}", "1").replace("{episode_id}", "1").replace("{user_id}", "1")
        endpoints += [(method.upper(), concrete) for method in operations if (method.upper(), path) not in PUBLIC_ENDPOINTS]
    return endpoints


@pytest.mark.parametrize(("method", "path"), _all_endpoints())
def test_every_endpoint_except_login_and_health_requires_authentication(api, method, path):
    response = api.request(method, path)
    assert response.status_code == 401, f"{method} {path} answered {response.status_code} without a token"


def test_garbage_token_is_401(api):
    response = api.get("/api/requests", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401


# ---------------------------------------------------------------- client isolation (IDOR)


def test_client_cannot_read_another_clients_request_by_id(api, client_a, client_b, make_request):
    others = make_request(client_b)
    response = api.get(f"/api/requests/{others.id}", headers=auth(client_a))
    # 404, not 403: a client cannot even learn that the id exists.
    assert response.status_code == 404
    assert api.get(f"/api/requests/{others.id}/assignments", headers=auth(client_a)).status_code == 404


def test_client_list_only_contains_own_requests(api, client_a, client_b, make_request):
    own = make_request(client_a)
    make_request(client_b)
    page = api.get("/api/requests", headers=auth(client_a)).json()
    assert [r["id"] for r in page["items"]] == [own.id]
    # Trying to filter by another client does not widen visibility.
    page = api.get("/api/requests", params={"client_id": client_b.id}, headers=auth(client_a)).json()
    assert page["items"] == []


def test_client_cannot_accept_or_reject_another_clients_delivery(api, client_a, client_b, make_request):
    others = make_request(client_b, status="delivered")
    assert api.post(f"/api/requests/{others.id}/accept", headers=auth(client_a)).status_code == 404
    reject = api.post(f"/api/requests/{others.id}/reject", json={"reason": "not mine"}, headers=auth(client_a))
    assert reject.status_code == 404


# ---------------------------------------------------------------- role boundaries


def test_client_cannot_perform_operator_actions(api, client_a, make_request, make_episode):
    own = make_request(client_a, status="in_progress")
    episode = make_episode()
    headers = auth(client_a)
    assert api.post(f"/api/requests/{own.id}/assignments", json={"episode_ids": [episode.id]}, headers=headers).status_code == 403
    assert api.delete(f"/api/requests/{own.id}/assignments/{episode.id}", headers=headers).status_code == 403
    assert api.post(f"/api/requests/{own.id}/transition", json={"to_status": "delivered"}, headers=headers).status_code == 403
    assert api.get("/api/episodes", headers=headers).status_code == 403
    assert api.get("/api/episodes/facets", headers=headers).status_code == 403


def test_client_cannot_manage_users(api, client_a, operator):
    headers = auth(client_a)
    assert api.get("/api/users", headers=headers).status_code == 403
    assert api.post("/api/users", json={}, headers=headers).status_code == 403
    assert api.patch(f"/api/users/{client_a.id}", json={"role": "admin"}, headers=headers).status_code == 403


def test_operator_cannot_manage_users_or_escalate(api, operator):
    headers = auth(operator)
    assert api.get("/api/users", headers=headers).status_code == 403
    new_user = {"email": "x@example.com", "name": "X", "role": "admin", "password": "long-enough"}
    assert api.post("/api/users", json=new_user, headers=headers).status_code == 403
    # Privilege escalation attempt on their own account.
    assert api.patch(f"/api/users/{operator.id}", json={"role": "admin"}, headers=headers).status_code == 403


def test_operator_cannot_create_requests_or_act_as_client(api, operator, client_a, make_request):
    payload = {"task_name": "pick cup", "episodes_requested": 1, "deadline": "2099-01-01"}
    assert api.post("/api/requests", json=payload, headers=auth(operator)).status_code == 403
    delivered = make_request(client_a, status="delivered")
    assert api.post(f"/api/requests/{delivered.id}/accept", headers=auth(operator)).status_code == 403


def test_admin_can_manage_users_and_do_operator_work(api, admin, client_a, make_request, make_episode):
    headers = auth(admin)
    assert api.get("/api/users", headers=headers).status_code == 200
    assert api.get("/api/episodes", headers=headers).status_code == 200
    request = make_request(client_a, status="in_progress", episodes_requested=1)
    assert api.post(
        f"/api/requests/{request.id}/assignments", json={"episode_ids": [make_episode().id]}, headers=headers
    ).status_code == 200
