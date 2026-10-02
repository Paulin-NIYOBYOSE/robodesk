from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.errors import AuthenticationError, RateLimitedError
from app.core.rate_limit import FailedLoginLimiter
from app.core.security import create_access_token
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserOut
from app.services.auth import authenticate

router = APIRouter(prefix="/auth", tags=["auth"])

_settings = get_settings()
login_limiter = FailedLoginLimiter(_settings.login_max_failures, _settings.login_window_seconds)


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={401: {"description": "Invalid credentials"}, 403: {"description": "Account deactivated"},
               429: {"description": "Too many failed attempts"}},
)
def login(body: LoginRequest, db: DbSession) -> TokenResponse:
    if (retry_after := login_limiter.retry_after(body.email)) is not None:
        raise RateLimitedError(
            "Too many failed login attempts. Try again later.", headers={"Retry-After": str(retry_after)}
        )
    try:
        user = authenticate(db, body.email, body.password)
    except AuthenticationError:
        login_limiter.record_failure(body.email)
        raise
    login_limiter.reset(body.email)

    token, expires_in = create_access_token(user.id)
    return TokenResponse(access_token=token, expires_in=expires_in, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
