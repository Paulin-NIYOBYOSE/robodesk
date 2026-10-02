import json
import logging

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.logging import JsonFormatter
from app.db.session import get_db
from app.main import app
from app.models import UserRole
from tests.helpers import TEST_PASSWORD, auth


def access_records(caplog) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.name == "robodesk.access"]


def test_health_checks_the_database(api):
    response = api.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_an_unreachable_database_without_details(api):
    dead_engine = create_engine("postgresql+psycopg://nobody:secret@127.0.0.1:1/none", connect_args={"connect_timeout": 1})

    def unreachable_db():
        with Session(dead_engine) as session:
            yield session

    app.dependency_overrides[get_db] = unreachable_db
    try:
        response = api.get("/health")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "database": "unavailable"}
    assert "secret" not in response.text and "127.0.0.1" not in response.text


def test_one_structured_line_per_request_with_the_user_id(api, operator, caplog):
    caplog.set_level(logging.INFO)
    headers = auth(operator)
    api.get("/api/requests?status=submitted", headers=headers)

    [record] = access_records(caplog)
    assert (record.method, record.path, record.status, record.user_id) == ("GET", "/api/requests", 200, operator.id)
    assert record.duration_ms >= 0

    line = JsonFormatter().format(record)
    payload = json.loads(line)
    assert payload["message"] == "request"
    assert payload["user_id"] == operator.id
    token = headers["Authorization"].removeprefix("Bearer ")
    assert token not in line
    assert "status=submitted" not in line  # query strings are not logged


def test_anonymous_and_failed_requests_are_logged_too(api, caplog):
    caplog.set_level(logging.INFO)
    api.get("/api/requests")
    [record] = access_records(caplog)
    assert (record.status, record.user_id) == (401, None)


def test_login_never_logs_credentials(api, make_user, caplog):
    caplog.set_level(logging.DEBUG)
    make_user(UserRole.CLIENT, email="someone@example.com")
    response = api.post("/api/auth/login", json={"email": "someone@example.com", "password": TEST_PASSWORD})
    assert response.status_code == 200
    assert TEST_PASSWORD not in caplog.text
    assert response.json()["access_token"] not in caplog.text


def test_unexpected_errors_return_a_generic_500(operator, monkeypatch, caplog):
    def explode(*args, **kwargs):
        raise RuntimeError("relation secret_table does not exist")

    monkeypatch.setattr("app.services.requests.list_requests", explode)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/requests", headers=auth(operator))
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert "secret_table" in caplog.text  # logged for us, never sent to the client


def test_request_id_is_echoed_or_generated(api):
    assert api.get("/health", headers={"X-Request-ID": "abc-123"}).headers["x-request-id"] == "abc-123"
    generated = api.get("/health", headers={"X-Request-ID": "bad id with spaces"}).headers["x-request-id"]
    assert generated != "bad id with spaces" and len(generated) == 32
