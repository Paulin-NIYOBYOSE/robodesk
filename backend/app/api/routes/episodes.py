import io
import logging
from typing import Annotated

from fastapi import APIRouter, Query, UploadFile

from app.api.deps import DbSession, Paging, StaffUser
from app.core.config import get_settings
from app.core.errors import InvalidInputError, PayloadTooLargeError
from app.models import EpisodeQuality
from app.schemas.common import Page
from app.schemas.episode import EpisodeFacets, EpisodeOut
from app.schemas.imports import ImportReportOut
from app.services import episodes as episode_service
from app.services.episodes import EpisodeFilters
from app.services.importer import import_episodes

logger = logging.getLogger(__name__)

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


@router.post(
    "/import",
    response_model=ImportReportOut,
    responses={
        413: {"description": "File larger than MAX_IMPORT_BYTES (use the CLI for bulk loads)"},
        422: {"description": "Not a UTF-8 CSV with the expected header"},
    },
)
def import_csv(file: UploadFile, db: DbSession, operator: StaffUser) -> ImportReportOut:
    """Import episode metadata from a CSV export. Safe to repeat: ``episode_id`` is the
    idempotency key, so re-importing a file creates no duplicates."""
    max_bytes = get_settings().max_import_bytes
    if file.size is not None and file.size > max_bytes:
        raise PayloadTooLargeError(f"The file is larger than {max_bytes // (1024 * 1024)} MB")

    text = io.TextIOWrapper(file.file, encoding="utf-8-sig", newline="")
    try:
        report = import_episodes(db, text)
    except UnicodeDecodeError:
        raise InvalidInputError("The file must be a UTF-8 encoded CSV") from None
    logger.info(
        "episode import",
        extra={
            "user_id": operator.id,
            "processed": report.processed,
            "imported": report.imported,
            "skipped_duplicates": report.skipped_duplicates,
            "rejected": report.rejected,
        },
    )
    return ImportReportOut.from_report(report)
