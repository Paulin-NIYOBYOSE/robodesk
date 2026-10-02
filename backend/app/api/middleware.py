import logging
import re
import time
import uuid
from collections.abc import Awaitable, Callable

from fastapi import Request, Response

logger = logging.getLogger("robodesk.access")

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


async def log_requests(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    """One structured log line per request.

    Only the method, path (never the query string or headers), status, duration and
    user id are logged, so tokens and passwords cannot end up in the logs.
    """
    incoming_id = request.headers.get("x-request-id", "")
    request_id = incoming_id if _REQUEST_ID_PATTERN.match(incoming_id) else uuid.uuid4().hex
    start = time.perf_counter()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
    finally:
        logger.info(
            "request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": status_code,
                "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                # Set by the auth dependency; absent for anonymous requests.
                "user_id": getattr(request.state, "user_id", None),
                "request_id": request_id,
            },
        )
    response.headers["X-Request-ID"] = request_id
    return response
