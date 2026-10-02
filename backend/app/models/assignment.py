from datetime import datetime
from enum import StrEnum

from sqlalchemy import ForeignKey, Index, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, pg_enum
from app.models.episode import Episode
from app.models.user import User


class ExportStatus(StrEnum):
    PENDING = "pending"  # waiting for a worker (first try, or a retry after backoff)
    RUNNING = "running"  # claimed by a worker that holds a lease
    SUCCEEDED = "succeeded"
    FAILED = "failed"  # gave up after the maximum number of attempts


# Named so the service can recognise this specific violation (a concurrent assignment).
EPISODE_UNIQUE_CONSTRAINT = "uq_assignments_episode_id"


class Assignment(Base):
    """An episode assigned to a request.

    The unique constraint on ``episode_id`` is what guarantees "at most one request
    per episode" — including when two operators assign the same episode at once.
    Unassigning deletes the row, which frees the episode again.
    """

    __tablename__ = "assignments"
    __table_args__ = (
        # The worker's "next due job" query only ever looks at unfinished exports.
        Index(
            "ix_assignments_export_due",
            "export_next_attempt_at",
            postgresql_where=text("export_status IN ('pending', 'running')"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("dataset_requests.id", ondelete="CASCADE"), index=True
    )
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id"), unique=True)
    assigned_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())

    # Simulated export of this episode for this request (see services/exports.py).
    export_status: Mapped[ExportStatus] = mapped_column(
        pg_enum(ExportStatus, "export_status"), default=ExportStatus.PENDING, server_default="pending"
    )
    export_attempts: Mapped[int] = mapped_column(default=0, server_default="0")
    export_next_attempt_at: Mapped[datetime] = mapped_column(server_default=func.now())
    export_lease_expires_at: Mapped[datetime | None]
    export_error: Mapped[str | None] = mapped_column(Text)
    exported_at: Mapped[datetime | None]

    episode: Mapped[Episode] = relationship(lazy="raise_on_sql")
    assigned_by: Mapped[User] = relationship(lazy="raise_on_sql")
