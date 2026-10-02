from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession, Paging, StaffUser
from app.models import EpisodeQuality
from app.schemas.common import Page
from app.schemas.episode import EpisodeFacets, EpisodeOut
from app.services import episodes as episode_service
from app.services.episodes import EpisodeFilters

router = APIRouter(prefix="/episodes", tags=["episodes"])


@router.get("", response_model=Page[EpisodeOut])
def list_episodes(
    db: DbSession,
    _: StaffUser,
    paging: Paging,
    task_name: Annotated[str | None, Query(max_length=200)] = None,
    quality: EpisodeQuality | None = None,
    robot_id: Annotated[str | None, Query(max_length=32)] = None,
    available: Annotated[bool, Query(description="Only episodes that can be assigned now")] = False,
    search: Annotated[str | None, Query(max_length=64, description="Episode ID prefix, e.g. EP-001")] = None,
) -> Page[EpisodeOut]:
    filters = EpisodeFilters(
        task_name=task_name, quality=quality, robot_id=robot_id, available_only=available, search=search
    )
    rows, total = episode_service.list_episodes(db, filters, offset=paging.offset, limit=paging.page_size)
    return Page(
        items=[EpisodeOut.from_orm_with(episode, assigned_request_id=request_id) for episode, request_id in rows],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.get("/facets", response_model=EpisodeFacets)
def facets(db: DbSession, _: StaffUser) -> EpisodeFacets:
    robots, task_names = episode_service.episode_facets(db)
    return EpisodeFacets(robots=robots, task_names=task_names)
