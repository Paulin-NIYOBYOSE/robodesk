from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AuthenticationError, PermissionDeniedError
from app.core.security import verify_password
from app.models import User


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email))
    # Same error (and same hashing cost) for unknown email and wrong password.
    if not verify_password(user.password_hash if user else None, password):
        raise AuthenticationError("Invalid email or password")
    if not user.is_active:
        raise PermissionDeniedError("This account has been deactivated")
    return user
