from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, pg_enum


class EpisodeQuality(StrEnum):
    GOOD = "good"
    USABLE = "usable"
    BAD = "bad"


ASSIGNABLE_QUALITIES = frozenset({EpisodeQuality.GOOD, EpisodeQuality.USABLE})


class Robot(CreatedAtMixin, Base):
    """Reference table of known robots; episodes for any other robot are rejected on import."""

    __tablename__ = "robots"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)


class Episode(CreatedAtMixin, Base):
    __tablename__ = "episodes"
    __table_args__ = (
        CheckConstraint("duration_seconds > 0", name="duration_positive"),
        # Analytics: episodes per day per robot over a date range (index-only scan).
        Index("ix_episodes_recorded_at_robot_id", "recorded_at", "robot_id"),
        # Episode browser: filter by robot, newest first.
        Index("ix_episodes_robot_id_recorded_at", "robot_id", "recorded_at"),
        # Episode browser: filter by task (+ quality), newest first; also serves task facets.
        Index("ix_episodes_task_name_quality_recorded_at", "task_name", "quality", "recorded_at"),
        # Analytics: top tasks by good episodes, only indexes the rows that query reads.
        Index(
            "ix_episodes_good_recorded_at_task_name",
            "recorded_at",
            "task_name",
            postgresql_where=text("quality = 'good'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # "C" collation makes prefix searches (LIKE 'EP-001%') able to use the unique index.
    episode_id: Mapped[str] = mapped_column(String(64, collation="C"), unique=True)
    robot_id: Mapped[str] = mapped_column(ForeignKey("robots.id"))
    task_name: Mapped[str] = mapped_column(String(200))
    recorded_at: Mapped[datetime]
    duration_seconds: Mapped[int]
    operator_name: Mapped[str] = mapped_column(String(120))
    quality: Mapped[EpisodeQuality] = mapped_column(pg_enum(EpisodeQuality, "episode_quality"))
