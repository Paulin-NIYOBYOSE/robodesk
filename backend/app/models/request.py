from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, pg_enum
from app.models.user import User


class RequestStatus(StrEnum):
    SUBMITTED = "submitted"
    IN_PROGRESS = "in_progress"
    DELIVERED = "delivered"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


request_status_enum = pg_enum(RequestStatus, "request_status")


class DatasetRequest(TimestampMixin, Base):
    """A client's request for a dataset ("Request" in the brief)."""

    __tablename__ = "dataset_requests"
    __table_args__ = (
        CheckConstraint("episodes_requested > 0", name="episodes_requested_positive"),
        Index("ix_dataset_requests_client_id_created_at", "client_id", "created_at"),
        Index("ix_dataset_requests_status", "status"),
        Index("ix_dataset_requests_deadline", "deadline"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    task_name: Mapped[str] = mapped_column(String(200))
    episodes_requested: Mapped[int]
    deadline: Mapped[date]
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[RequestStatus] = mapped_column(request_status_enum, default=RequestStatus.SUBMITTED)

    # raise_on_sql: relationships must be eager-loaded explicitly, so an accidental
    # N+1 query fails loudly in tests instead of silently in production.
    client: Mapped[User] = relationship(lazy="raise_on_sql")


class RequestStatusHistory(Base):
    """Append-only audit trail: one row per status change, including creation."""

    __tablename__ = "request_status_history"
    __table_args__ = (Index("ix_request_status_history_request_id_changed_at", "request_id", "changed_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("dataset_requests.id", ondelete="CASCADE"))
    previous_status: Mapped[RequestStatus | None] = mapped_column(request_status_enum)
    new_status: Mapped[RequestStatus] = mapped_column(request_status_enum)
    changed_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(server_default=func.now())
    comment: Mapped[str | None] = mapped_column(Text)

    changed_by: Mapped[User] = relationship(lazy="raise_on_sql")
    request: Mapped[DatasetRequest] = relationship(lazy="raise_on_sql")
