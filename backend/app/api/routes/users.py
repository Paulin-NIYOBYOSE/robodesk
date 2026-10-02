from fastapi import APIRouter, status

from app.api.deps import AdminUser, DbSession, StaffUser
from app.schemas.user import UserCreate, UserOut, UserSummary, UserUpdate
from app.services import users as user_service

router = APIRouter(prefix="/users", tags=["users"])
clients_router = APIRouter(prefix="/clients", tags=["users"])


@clients_router.get("", response_model=list[UserSummary])
def list_clients(db: DbSession, _: StaffUser) -> list[UserSummary]:
    """Client accounts, for the operators' request filter (read-only, no emails)."""
    return [UserSummary.model_validate(user) for user in user_service.list_clients(db)]


@router.get("", response_model=list[UserOut])
def list_users(db: DbSession, _: AdminUser) -> list[UserOut]:
    return [UserOut.model_validate(user) for user in user_service.list_users(db)]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED,
             responses={409: {"description": "Email already in use"}})
def create_user(body: UserCreate, db: DbSession, _: AdminUser) -> UserOut:
    return UserOut.model_validate(user_service.create_user(db, body))


@router.patch("/{user_id}", response_model=UserOut,
              responses={404: {"description": "User not found"},
                         409: {"description": "Would lock out the last admin or the acting admin"}})
def update_user(user_id: int, body: UserUpdate, db: DbSession, admin: AdminUser) -> UserOut:
    return UserOut.model_validate(user_service.update_user(db, user_id, body, actor=admin))
