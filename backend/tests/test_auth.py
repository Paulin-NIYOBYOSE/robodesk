from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import get_settings
from app.core.rate_limit import FailedLoginLimiter
from app.core.security import JWT_ALGORITHM
from app.models import UserRole
from tests.helpers import TEST_PASSWORD, auth


def login(api, email, password):
    return api.post("/api/auth/login", json={"email": email, "password": password})


def test_valid_login_returns_token_and_user(api, make_user):
    user = make_user(UserRole.OPERATOR, email="ops@example.com")
    response = login(api, "ops@example.com", TEST_PASSWORD)
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_settings().access_token_expire_minutes * 60
    assert body["user"]["id"] == user.id
    assert "password_hash" not in body["user"]

    me = api.get("/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.status_code == 200
    assert me.json()["email"] == "ops@example.com"


def test_login_email_is_case_insensitive(api, make_user):
    make_user(UserRole.CLIENT, email="client@example.com")
    assert login(api, "  Client@Example.COM ", TEST_PASSWORD).status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_answer(api, make_user):
    make_user(UserRole.CLIENT, email="client@example.com")
    wrong_password = login(api, "client@example.com", "nope")
    unknown_email = login(api, "nobody@example.com", TEST_PASSWORD)
    assert wrong_password.status_code == unknown_email.status_code == 401
    assert wrong_password.json() == unknown_email.json() == {"detail": "Invalid email or password"}


def test_inactive_account_cannot_log_in(api, make_user):
    make_user(UserRole.CLIENT, email="gone@example.com", active=False)
    response = login(api, "gone@example.com", TEST_PASSWORD)
    assert response.status_code == 403
    assert response.json()["detail"] == "This account has been deactivated"


def test_token_of_deactivated_user_stops_working_immediately(api, db, make_user):
    user = make_user(UserRole.OPERATOR)
    headers = auth(user)
    assert api.get("/api/auth/me", headers=headers).status_code == 200
    user.is_active = False
    db.commit()
    assert api.get("/api/auth/me", headers=headers).status_code == 401


def test_role_comes_from_the_database_not_the_token(api, db, make_user):
    user = make_user(UserRole.ADMIN)
    headers = auth(user)
    assert api.get("/api/users", headers=headers).status_code == 200
    user.role = UserRole.CLIENT  # demoted after the token was issued
    db.commit()
    assert api.get("/api/users", headers=headers).status_code == 403


def test_expired_token_is_rejected(api, make_user):
    user = make_user(UserRole.OPERATOR)
    past = datetime.now(UTC) - timedelta(hours=2)
    token = jwt.encode(
        {"sub": str(user.id), "iat": past, "exp": past + timedelta(minutes=5)},
        get_settings().jwt_secret,
        algorithm=JWT_ALGORITHM,
    )
    response = api.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_token_signed_with_another_key_is_rejected(api, make_user):
    user = make_user(UserRole.ADMIN)
    now = datetime.now(UTC)
    forged = jwt.encode(
        {"sub": str(user.id), "iat": now, "exp": now + timedelta(minutes=5)}, "attacker-key-" * 4, algorithm="HS256"
    )
    assert api.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_unsigned_token_is_rejected(api, make_user):
    user = make_user(UserRole.ADMIN)
    now = datetime.now(UTC)
    unsigned = jwt.encode({"sub": str(user.id), "iat": now, "exp": now + timedelta(minutes=5)}, None, algorithm="none")
    assert api.get("/api/auth/me", headers={"Authorization": f"Bearer {unsigned}"}).status_code == 401


def test_repeated_failures_are_rate_limited(api, make_user):
    make_user(UserRole.CLIENT, email="target@example.com")
    for _ in range(get_settings().login_max_failures):
        assert login(api, "target@example.com", "guess").status_code == 401

    blocked = login(api, "target@example.com", TEST_PASSWORD)  # even the right password
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) > 0


def test_successful_login_resets_the_failure_count(api, make_user):
    make_user(UserRole.CLIENT, email="target@example.com")
    for _ in range(get_settings().login_max_failures - 1):
        login(api, "target@example.com", "guess")
    assert login(api, "target@example.com", TEST_PASSWORD).status_code == 200
    assert login(api, "target@example.com", "guess").status_code == 401  # counter restarted


def test_limiter_forgets_old_failures_and_stays_bounded():
    now = [0.0]
    limiter = FailedLoginLimiter(max_failures=2, window_seconds=60, clock=lambda: now[0])
    limiter.record_failure("a")
    limiter.record_failure("a")
    assert limiter.retry_after("a") == 60
    now[0] = 61
    assert limiter.retry_after("a") is None  # window passed

    limiter.SWEEP_THRESHOLD = 100
    for n in range(500):  # an attacker spraying random emails
        limiter.record_failure(f"random-{n}")
        now[0] += 1
    assert limiter.tracked_keys() <= 100
