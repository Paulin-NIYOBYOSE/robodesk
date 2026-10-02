import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DbSession

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health", responses={503: {"description": "Database unreachable"}})
def health(db: DbSession) -> JSONResponse:
    """Liveness + database readiness probe. Unauthenticated, reveals no internals."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        logger.exception("health check: database unavailable")
        return JSONResponse({"status": "unavailable", "database": "unavailable"}, status_code=503)
    return JSONResponse({"status": "ok", "database": "ok"})
