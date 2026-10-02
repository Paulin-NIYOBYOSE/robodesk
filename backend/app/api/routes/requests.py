from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.deps import ClientUser, CurrentUser, DbSession, Paging, StaffUser
from app.models import RequestStatus, User
from app.schemas.common import Page
from app.schemas.episode import EpisodeOut
from app.schemas.request import (
    AssignIn,
    AssignmentOut,
    AssignResult,
    RejectIn,
    RequestCreate,
    RequestDetail,
    RequestOut,
    RequestSort,
    RequestSummary,
    StatusHistoryOut,
    TransitionIn,
)
from app.services import assignments as assignment_service
from app.services import requests as request_service
from app.services.requests import RequestFilters

router = APIRouter(prefix="/requests", tags=["requests"])

_NOT_FOUND = {404: {"description": "Request not found (or not visible to this user)"}}
_CONFLICT = {409: {"description": "Not allowed in the request's current state"}}


def _detail(db: DbSession, request_id: int, user: User) -> RequestDetail:
    view = request_service.get_request_detail(db, request_id, user)
    return RequestDetail.from_orm_with(
        view.request,
        assigned_count=view.assigned_count,
        history=[StatusHistoryOut.model_validate(entry) for entry in view.history],
        allowed_transitions=view.allowed_transitions,
    )


@router.get("", response_model=Page[RequestOut])
def list_requests(
    db: DbSession,
    user: CurrentUser,
    paging: Paging,
    status_filter: Annotated[RequestStatus | None, Query(alias="status")] = None,
    task_name: Annotated[str | None, Query(max_length=200)] = None,
    client_id: int | None = None,
    deadline_before: date | None = None,
    sort: RequestSort = "newest",
) -> Page[RequestOut]:
    """Clients only ever receive their own requests; operators and admins see all."""
    filters = RequestFilters(
        status=status_filter, task_name=task_name, client_id=client_id, deadline_before=deadline_before, sort=sort
    )
    rows, total = request_service.list_requests(db, user, filters, offset=paging.offset, limit=paging.page_size)
    return Page(
        items=[RequestOut.from_orm_with(request, assigned_count=assigned) for request, assigned in rows],
        total=total,
        page=paging.page,
        page_size=paging.page_size,
    )


@router.get("/summary", response_model=RequestSummary)
def summary(db: DbSession, user: CurrentUser) -> RequestSummary:
    by_status, overdue = request_service.request_summary(db, user)
    return RequestSummary(by_status=by_status, total=sum(by_status.values()), overdue=overdue)


@router.post("", response_model=RequestDetail, status_code=status.HTTP_201_CREATED)
def create_request(body: RequestCreate, db: DbSession, client: ClientUser) -> RequestDetail:
    request = request_service.create_request(db, client, body)
    return _detail(db, request.id, client)


@router.get("/{request_id}", response_model=RequestDetail, responses=_NOT_FOUND)
def get_request(request_id: int, db: DbSession, user: CurrentUser) -> RequestDetail:
    return _detail(db, request_id, user)


@router.post("/{request_id}/transition", response_model=RequestDetail, responses={**_NOT_FOUND, **_CONFLICT})
def transition(request_id: int, body: TransitionIn, db: DbSession, user: CurrentUser) -> RequestDetail:
    """Move a request through its workflow. Who may make which move is decided server-side."""
    request_service.transition_request(db, request_id, body.to_status, user, body.comment)
    return _detail(db, request_id, user)


@router.post("/{request_id}/accept", response_model=RequestDetail, responses={**_NOT_FOUND, **_CONFLICT})
def accept(request_id: int, db: DbSession, client: ClientUser) -> RequestDetail:
    request_service.transition_request(db, request_id, RequestStatus.ACCEPTED, client)
    return _detail(db, request_id, client)


@router.post("/{request_id}/reject", response_model=RequestDetail, responses={**_NOT_FOUND, **_CONFLICT})
def reject(request_id: int, body: RejectIn, db: DbSession, client: ClientUser) -> RequestDetail:
    request_service.transition_request(db, request_id, RequestStatus.REJECTED, client, body.reason)
    return _detail(db, request_id, client)


@router.get("/{request_id}/assignments", response_model=Page[AssignmentOut], responses=_NOT_FOUND)
def list_assignments(request_id: int, db: DbSession, user: CurrentUser, paging: Paging) -> Page[AssignmentOut]:
    assignments, total = assignment_service.list_assignments(
        db, request_id, user, offset=paging.offset, limit=paging.page_size
    )
    items = [
        AssignmentOut.from_orm_with(
            assignment, episode=EpisodeOut.from_orm_with(assignment.episode, assigned_request_id=assignment.request_id)
        )
        for assignment in assignments
    ]
    return Page(items=items, total=total, page=paging.page, page_size=paging.page_size)


@router.post("/{request_id}/assignments", response_model=AssignResult, responses={**_NOT_FOUND, **_CONFLICT})
def assign(request_id: int, body: AssignIn, db: DbSession, operator: StaffUser) -> AssignResult:
    """Assign episodes (all or nothing). Bad-quality or already-assigned episodes are refused."""
    assigned_count = assignment_service.assign_episodes(db, request_id, body.episode_ids, operator)
    request = request_service.get_request_for_user(db, request_id, operator)
    return AssignResult(
        assigned=len(set(body.episode_ids)),
        assigned_count=assigned_count,
        episodes_requested=request.episodes_requested,
    )


@router.delete(
    "/{request_id}/assignments/{episode_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**_NOT_FOUND, **_CONFLICT},
)
def unassign(request_id: int, episode_id: int, db: DbSession, operator: StaffUser) -> Response:
    assignment_service.unassign_episode(db, request_id, episode_id, operator)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
