from datetime import datetime

from app.models import EpisodeQuality
from app.schemas.common import OutputModel


class EpisodeOut(OutputModel):
    id: int
    episode_id: str
    robot_id: str
    task_name: str
    recorded_at: datetime
    duration_seconds: int
    operator_name: str
    quality: EpisodeQuality
    # The request this episode is currently assigned to, if any.
    assigned_request_id: int | None = None


class EpisodeFacets(OutputModel):
    """Values for the episode browser's filter dropdowns."""

    robots: list[str]
    task_names: list[str]
