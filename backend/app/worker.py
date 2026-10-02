"""Export worker: ``python -m app.worker``. Safe to run several copies (see services/exports.py)."""

import logging
import signal
import threading

from sqlalchemy.exc import OperationalError

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import SessionLocal
from app.services.exports import process_one

logger = logging.getLogger("robodesk.worker")
IDLE_POLL_SECONDS = 1.0
DB_RETRY_SECONDS = 5.0


def run(stop: threading.Event) -> None:
    logger.info("export worker started")
    while not stop.is_set():
        try:
            outcome = process_one(SessionLocal)
        except OperationalError:
            logger.exception("database unavailable; retrying")
            stop.wait(DB_RETRY_SECONDS)
            continue
        if outcome is None:
            stop.wait(IDLE_POLL_SECONDS)
            continue
        job, error = outcome
        logger.info(
            "export attempt finished",
            extra={
                "assignment_id": job.assignment_id,
                "request_id": job.request_id,
                "attempt": job.attempt,
                "succeeded": error is None,
                "error": error,
            },
        )
    logger.info("export worker stopped")


def main() -> None:
    configure_logging(get_settings().log_level)
    stop = threading.Event()
    # Finish the current job, then exit, on `docker compose stop` / Ctrl-C.
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stop.set())
    run(stop)


if __name__ == "__main__":
    main()
