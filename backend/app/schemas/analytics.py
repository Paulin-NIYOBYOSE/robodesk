import datetime as dt

from pydantic import Field

from app.models import RequestStatus
from app.schemas.common import OutputModel


class RobotDayCount(OutputModel):
    date: dt.date
    robot_id: str
    count: int


class RequestFulfilment(OutputModel):
    counts_by_status: dict[RequestStatus, int]
    total: int
    # Median time from submission to first delivery; null when nothing was delivered.
    median_seconds_to_delivery: float | None
    # Number of delivered requests the median is based on.
    delivered_requests: int


class TaskGoodCount(OutputModel):
    task_name: str
    good_episodes: int


class AnalyticsOut(OutputModel):
    from_date: dt.date = Field(serialization_alias="from")
    to_date: dt.date = Field(serialization_alias="to")
    episodes_per_day_by_robot: list[RobotDayCount]
    request_fulfilment: RequestFulfilment
    top_tasks_by_good_episodes: list[TaskGoodCount]
