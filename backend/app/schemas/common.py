from collections.abc import Callable
from typing import Annotated, Any, Self

from pydantic import AfterValidator, BaseModel, ConfigDict

from app.core.text import collapse_whitespace, normalize_task_name


class InputModel(BaseModel):
    """Base for request bodies: unknown fields are rejected, so a client cannot
    smuggle in fields such as ``status`` or ``client_id`` (mass assignment)."""

    model_config = ConfigDict(extra="forbid")


class OutputModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_with(cls, obj: Any, **extra: Any) -> Self:
        """Build from an ORM object plus fields it does not carry itself
        (aggregates such as ``assigned_count`` that were computed by the query)."""
        data = {name: getattr(obj, name) for name in cls.model_fields if name not in extra}
        return cls.model_validate({**data, **extra})


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


def _normalized(normalize: Callable[[str], str], max_length: int) -> AfterValidator:
    """Normalise first, then check length, so "   " counts as blank."""

    def validate(value: str) -> str:
        value = normalize(value)
        if not value:
            raise ValueError("must not be blank")
        if len(value) > max_length:
            raise ValueError(f"must be at most {max_length} characters")
        return value

    return AfterValidator(validate)


TaskName = Annotated[str, _normalized(normalize_task_name, 200)]
ShortText = Annotated[str, _normalized(collapse_whitespace, 120)]
