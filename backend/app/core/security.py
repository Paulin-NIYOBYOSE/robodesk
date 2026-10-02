"""Password hashing and JWT access tokens."""

from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.config import get_settings

JWT_ALGORITHM = "HS256"

_hasher = PasswordHasher()  # argon2id with the library's recommended parameters
# Verified against when the email is unknown, so a failed login takes the same time
# whether or not the account exists (prevents user enumeration by timing).
_DUMMY_HASH = _hasher.hash("robodesk-timing-equaliser")


class InvalidTokenError(Exception):
    """Raised for any token that is malformed, tampered with or expired."""


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    """Check a password. Pass ``None`` for an unknown user to keep timing uniform."""
    try:
        matches = _hasher.verify(password_hash or _DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        return False
    return matches and password_hash is not None


def create_access_token(user_id: int) -> tuple[str, int]:
    """Return a signed token and its lifetime in seconds.

    The token only carries the user id. Role and active status are read from the
    database on every request, so role changes and deactivation apply immediately.
    """
    settings = get_settings()
    lifetime = timedelta(minutes=settings.access_token_expire_minutes)
    now = datetime.now(UTC)
    claims = {"sub": str(user_id), "iat": now, "exp": now + lifetime}
    token = jwt.encode(claims, settings.jwt_secret, algorithm=JWT_ALGORITHM)
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> int:
    try:
        claims = jwt.decode(
            token,
            get_settings().jwt_secret,
            algorithms=[JWT_ALGORITHM],  # pinned: never trust the token's own "alg" header
            options={"require": ["sub", "iat", "exp"]},
        )
        return int(claims["sub"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidTokenError from exc
