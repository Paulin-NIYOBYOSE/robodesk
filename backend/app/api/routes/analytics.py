from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession, StaffUser
from app.schemas.analytics import AnalyticsOut, RequestFulfilment, RobotDayCount, TaskGoodCount
from app.services.analytics import analytics_for_range

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("", response_model=AnalyticsOut, response_model_by_alias=True,
            responses={422: {"description": "Invalid or too long date range"}})
def analytics(
    db: DbSession,
    _: StaffUser,
    from_date: Annotated[date, Query(alias="from", description="First day (UTC), inclusive")],
    to_date: Annotated[date, Query(alias="to", description="Last day (UTC), inclusive")],
) -> AnalyticsOut:
    result = analytics_for_range(db, from_date, to_date)
    fulfilment = result.fulfilment
    return AnalyticsOut(
        from_date=from_date,
        to_date=to_date,
        episodes_per_day_by_robot=[
            RobotDayCount(date=day, robot_id=robot_id, count=count)
            for day, robot_id, count in result.episodes_per_day_by_robot
        ],
        request_fulfilment=RequestFulfilment(
            counts_by_status=fulfilment.counts_by_status,
            total=sum(fulfilment.counts_by_status.values()),
            median_seconds_to_delivery=fulfilment.median_seconds_to_delivery,
            delivered_requests=fulfilment.delivered_requests,
        ),
        top_tasks_by_good_episodes=[
            TaskGoodCount(task_name=task_name, good_episodes=count) for task_name, count in result.top_tasks
        ],
    )
