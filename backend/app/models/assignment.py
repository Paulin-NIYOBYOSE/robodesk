from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.episode import Episode
from app.models.user import User

# Named so the service can recognise this specific violation (a concurrent assignment).
EPISODE_UNIQUE_CONSTRAINT = "uq_assignments_episode_id"


class Assignment(Base):
    """An episode assigned to a request.

    The unique constraint on ``episode_id`` is what guarantees "at most one request
    per episode" — including when two operators assign the same episode at once.
    Unassigning deletes the row, which frees the episode again.
    """

    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("dataset_requests.id", ondelete="CASCADE"), index=True
    )
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id"), unique=True)
    assigned_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())

    episode: Mapped[Episode] = relationship(lazy="raise_on_sql")
    assigned_by: Mapped[User] = relationship(lazy="raise_on_sql")
