from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, EmailStr, StringConstraints, model_validator

from app.models import UserRole
from app.schemas.common import InputModel, OutputModel, ShortText

Email = Annotated[EmailStr, AfterValidator(str.lower)]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class UserSummary(OutputModel):
    """Compact user reference embedded in other responses."""

    id: int
    name: str
    role: UserRole
    organisation: str | None


class UserOut(UserSummary):
    email: str
    is_active: bool
    created_at: datetime


class UserCreate(InputModel):
    email: Email
    name: ShortText
    role: UserRole
    organisation: ShortText | None = None
    password: Password


class UserUpdate(InputModel):
    """Partial update; only the fields present in the body are changed."""

    name: ShortText | None = None
    role: UserRole | None = None
    organisation: ShortText | None = None
    is_active: bool | None = None
    password: Password | None = None

    @model_validator(mode="after")
    def _reject_null_for_required_fields(self) -> "UserUpdate":
        for field in ("name", "role", "is_active", "password"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self
