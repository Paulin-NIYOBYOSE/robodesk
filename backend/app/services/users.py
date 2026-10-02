from collections.abc import Iterable

from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.core.security import hash_password
from app.models import User, UserRole
from app.schemas.user import UserCreate, UserUpdate


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.role, User.name)))


def list_clients(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.role == UserRole.CLIENT).order_by(User.name)))


def create_user(db: Session, data: UserCreate) -> User:
    user = User(
        email=data.email,
        name=data.name,
        role=data.role,
        organisation=data.organisation,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:  # unique email (also covers two concurrent creates)
        db.rollback()
        raise ConflictError("A user with this email already exists") from exc
    return user


def update_user(db: Session, user_id: int, changes: UserUpdate, actor: User) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")

    fields = changes.model_dump(exclude_unset=True)
    changes_role = "role" in fields and fields["role"] != user.role
    deactivates = fields.get("is_active") is False

    if user.id == actor.id and (changes_role or deactivates):
        raise ConflictError("You cannot change your own role or deactivate your own account")
    if user.role == UserRole.ADMIN and user.is_active and (changes_role or deactivates):
        _ensure_another_active_admin(db, excluding_user_id=user.id)

    if password := fields.pop("password", None):
        user.password_hash = hash_password(password)
    for field, value in fields.items():
        setattr(user, field, value)
    db.commit()
    return user


def _ensure_another_active_admin(db: Session, excluding_user_id: int) -> None:
    # Row locks serialise concurrent demotions, so two admins cannot demote each
    # other at the same moment and leave the system with no admin.
    admin_ids = db.scalars(
        select(User.id).where(User.role == UserRole.ADMIN, User.is_active).with_for_update()
    ).all()
    if not any(admin_id != excluding_user_id for admin_id in admin_ids):
        raise ConflictError("At least one active admin is required")


class SeedUser(BaseModel):
    """Shape of an entry in seed/users.json."""

    email: EmailStr
    password: str
    role: UserRole
    name: str
    organisation: str | None = None


def seed_users(db: Session, entries: Iterable[SeedUser]) -> tuple[int, int]:
    """Create any seed users that do not exist yet. Returns (created, already_present).

    Existing accounts are left untouched, so re-running never resets a password
    or role that an admin has since changed.
    """
    created = existing = 0
    for entry in entries:
        email = entry.email.lower()
        if db.scalar(select(User.id).where(User.email == email)) is not None:
            existing += 1
            continue
        db.add(
            User(
                email=email,
                name=entry.name,
                role=entry.role,
                organisation=entry.organisation,
                password_hash=hash_password(entry.password),
            )
        )
        created += 1
    db.commit()
    return created, existing
