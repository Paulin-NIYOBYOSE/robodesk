"""ORM models. Importing this package registers every table on ``Base.metadata``."""

from app.models.assignment import EPISODE_UNIQUE_CONSTRAINT, Assignment, ExportStatus
from app.models.episode import ASSIGNABLE_QUALITIES, Episode, EpisodeQuality, Robot
from app.models.request import DatasetRequest, RequestStatus, RequestStatusHistory
from app.models.user import STAFF_ROLES, User, UserRole

__all__ = [
    "ASSIGNABLE_QUALITIES",
    "EPISODE_UNIQUE_CONSTRAINT",
    "STAFF_ROLES",
    "Assignment",
    "DatasetRequest",
    "Episode",
    "EpisodeQuality",
    "ExportStatus",
    "RequestStatus",
    "RequestStatusHistory",
    "Robot",
    "User",
    "UserRole",
]
