import pytest

from app.core.errors import ConflictError
from app.models import User, UserRole
from app.schemas.user import UserUpdate
from app.services.users import update_user
from tests.helpers import TEST_PASSWORD, auth

NEW_USER = {
    "email": "New.Person@Example.com",
    "name": "New Person",
    "role": "operator",
    "password": "a-long-password",
}


def test_admin_creates_user_with_hashed_password(api, db, admin):
    response = api.post("/api/users", json=NEW_USER, headers=auth(admin))
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new.person@example.com"
    assert body["role"] == "operator"

    stored = db.get(User, body["id"])
    assert stored.password_hash.startswith("$argon2id$")
    assert "a-long-password" not in stored.password_hash

    login = api.post("/api/auth/login", json={"email": "new.person@example.com", "password": "a-long-password"})
    assert login.status_code == 200


def test_duplicate_email_is_a_conflict(api, admin):
    api.post("/api/users", json=NEW_USER, headers=auth(admin))
    response = api.post("/api/users", json={**NEW_USER, "email": "new.person@EXAMPLE.com"}, headers=auth(admin))
    assert response.status_code == 409


def test_short_password_and_unknown_fields_are_rejected(api, admin):
    assert api.post("/api/users", json={**NEW_USER, "password": "short"}, headers=auth(admin)).status_code == 422
    assert api.post("/api/users", json={**NEW_USER, "is_superuser": True}, headers=auth(admin)).status_code == 422


def test_admin_changes_role_and_deactivates(api, admin, operator):
    response = api.patch(f"/api/users/{operator.id}", json={"role": "admin"}, headers=auth(admin))
    assert response.status_code == 200
    assert response.json()["role"] == "admin"

    response = api.patch(f"/api/users/{operator.id}", json={"is_active": False}, headers=auth(admin))
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    login = api.post("/api/auth/login", json={"email": operator.email, "password": TEST_PASSWORD})
    assert login.status_code == 403


def test_admin_cannot_demote_or_deactivate_themselves(api, admin, make_user):
    make_user(UserRole.ADMIN)  # another admin exists, so this is purely the self-guard
    assert api.patch(f"/api/users/{admin.id}", json={"role": "operator"}, headers=auth(admin)).status_code == 409
    assert api.patch(f"/api/users/{admin.id}", json={"is_active": False}, headers=auth(admin)).status_code == 409
    assert api.patch(f"/api/users/{admin.id}", json={"name": "Renamed"}, headers=auth(admin)).status_code == 200


def test_last_active_admin_cannot_be_removed(db, admin, operator):
    # Through the API the self-guard already covers a lone admin; this check exists for
    # the race where two admins demote each other at the same moment. Exercise it directly.
    with pytest.raises(ConflictError, match="At least one active admin"):
        update_user(db, admin.id, UserUpdate(role=UserRole.OPERATOR), actor=operator)


def test_null_for_required_fields_is_rejected(api, admin, operator):
    response = api.patch(f"/api/users/{operator.id}", json={"name": None}, headers=auth(admin))
    assert response.status_code == 422


def test_unknown_user_is_404(api, admin):
    assert api.patch("/api/users/9999", json={"name": "X"}, headers=auth(admin)).status_code == 404
