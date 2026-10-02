import logging

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.middleware import log_requests
from app.api.routes import auth, episodes, health, requests, users
from app.core.config import get_settings
from app.core.errors import DomainError
from app.core.logging import configure_logging

logger = logging.getLogger(__name__)

API_DESCRIPTION = """
Internal API for **RoboDesk — Robotics Dataset Request & Operations Platform**.

Clients submit dataset requests; operators fulfil them by assigning recorded episodes;
clients accept or reject the delivery. Authenticate with `POST /api/auth/login` and send
the returned token as `Authorization: Bearer <token>`.
"""


async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse({"detail": exc.message}, status_code=exc.status_code, headers=exc.headers)


async def handle_integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
    # Expected conflicts are translated by the services; this is the safety net.
    # Never echo the database message: it can contain table names and values.
    constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    logger.warning("unhandled integrity error", extra={"constraint": constraint})
    return JSONResponse({"detail": "The request conflicts with existing data"}, status_code=409)


async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    logger.error("unhandled error", exc_info=exc)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="RoboDesk API",
        description=API_DESCRIPTION,
        version="1.0.0",
        # Interactive docs are a development aid; they are not served in production.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )
    app.middleware("http")(log_requests)

    app.add_exception_handler(DomainError, handle_domain_error)
    app.add_exception_handler(IntegrityError, handle_integrity_error)
    app.add_exception_handler(Exception, handle_unexpected_error)

    api = APIRouter(prefix="/api")
    for module in (auth, requests, episodes, users):
        api.include_router(module.router)
    app.include_router(api)
    app.include_router(health.router)
    return app


app = create_app()
