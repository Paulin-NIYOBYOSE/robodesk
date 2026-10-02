"""The request status state machine — the single source of truth for transitions.

    submitted -> in_progress -> delivered -> accepted
                                         \\-> rejected -> in_progress (rework)

Clients own the accept/reject step; operators (and admins) own every other step.
"""

from app.core.errors import ConflictError, PermissionDeniedError
from app.models import STAFF_ROLES, RequestStatus, UserRole

_CLIENT_ONLY = frozenset({UserRole.CLIENT})

TRANSITIONS: dict[tuple[RequestStatus, RequestStatus], frozenset[UserRole]] = {
    (RequestStatus.SUBMITTED, RequestStatus.IN_PROGRESS): STAFF_ROLES,
    (RequestStatus.IN_PROGRESS, RequestStatus.DELIVERED): STAFF_ROLES,
    (RequestStatus.DELIVERED, RequestStatus.ACCEPTED): _CLIENT_ONLY,
    (RequestStatus.DELIVERED, RequestStatus.REJECTED): _CLIENT_ONLY,
    (RequestStatus.REJECTED, RequestStatus.IN_PROGRESS): STAFF_ROLES,
}

# Statuses in which the ball is in the operations team's court.
OPEN_STATUSES = frozenset({RequestStatus.SUBMITTED, RequestStatus.IN_PROGRESS, RequestStatus.REJECTED})


def check_transition(current: RequestStatus, target: RequestStatus, role: UserRole) -> None:
    """Raise unless ``role`` may move a request from ``current`` to ``target``."""
    allowed_roles = TRANSITIONS.get((current, target))
    if allowed_roles is None:
        raise ConflictError(f"A request cannot move from '{current}' to '{target}'")
    if role not in allowed_roles:
        if allowed_roles == _CLIENT_ONLY:
            raise PermissionDeniedError("Only the client who owns the request can accept or reject a delivery")
        raise PermissionDeniedError(f"Only operators can move a request to '{target}'")


def allowed_transitions(current: RequestStatus, role: UserRole) -> list[RequestStatus]:
    """Next statuses this role may choose (drives which actions the UI offers)."""
    return [target for (source, target), roles in TRANSITIONS.items() if source == current and role in roles]
