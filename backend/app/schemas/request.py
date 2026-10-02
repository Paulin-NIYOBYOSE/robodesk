from datetime import UTC, date, datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, field_validator

from app.models import ExportStatus, RequestStatus
from app.schemas.common import InputModel, OutputModel, TaskName
from app.schemas.episode import EpisodeOut
from app.schemas.user import UserSummary

MAX_EPISODES_PER_REQUEST = 10_000
MAX_ASSIGNMENT_BATCH = 500

Comment = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class RequestCreate(InputModel):
    task_name: TaskName
    episodes_requested: Annotated[int, Field(ge=1, le=MAX_EPISODES_PER_REQUEST)]
    deadline: date
    notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] | None = None

    @field_validator("deadline")
    @classmethod
    def _deadline_not_in_past(cls, value: date) -> date:
        if value < datetime.now(UTC).date():
            raise ValueError("deadline cannot be in the past")
        return value

    @field_validator("notes")
    @classmethod
    def _blank_notes_are_none(cls, value: str | None) -> str | None:
        return value or None


class TransitionIn(InputModel):
    to_status: RequestStatus
    comment: Comment | None = None


class RejectIn(InputModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=1000)]


class AssignIn(InputModel):
    episode_ids: Annotated[list[int], Field(min_length=1, max_length=MAX_ASSIGNMENT_BATCH)]


class StatusHistoryOut(OutputModel):
    previous_status: RequestStatus | None
    new_status: RequestStatus
    changed_by: UserSummary
    changed_at: datetime
    comment: str | None


class RequestOut(OutputModel):
    id: int
    task_name: str
    episodes_requested: int
    assigned_count: int
    deadline: date
    notes: str | None
    status: RequestStatus
    client: UserSummary
    created_at: datetime
    updated_at: datetime


class RequestDetail(RequestOut):
    history: list[StatusHistoryOut]
    # Statuses the current user may move this request to (the server decides, not the UI).
    allowed_transitions: list[RequestStatus]


class RequestSummary(OutputModel):
    by_status: dict[RequestStatus, int]
    total: int
    # Past deadline while still waiting on the operations team.
    overdue: int


class AssignmentOut(OutputModel):
    id: int
    episode: EpisodeOut
    assigned_at: datetime
    assigned_by: UserSummary
    export_status: ExportStatus
    export_attempts: int
    export_error: str | None
    exported_at: datetime | None


class AssignResult(OutputModel):
    assigned: int
    assigned_count: int
    episodes_requested: int


RequestSort = Literal["newest", "deadline"]
