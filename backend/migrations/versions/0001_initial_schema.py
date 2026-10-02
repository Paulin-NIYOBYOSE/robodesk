"""Initial schema: users, robots, episodes, dataset requests, status history, assignments.

Revision ID: 0001
Revises:
Create Date: 2026-10-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KNOWN_ROBOTS = ("arm-01", "arm-02", "arm-03", "mobile-01", "humanoid-01")

# Enum types are created explicitly once; columns reference them with create_type=False.
user_role = postgresql.ENUM("client", "operator", "admin", name="user_role", create_type=False)
episode_quality = postgresql.ENUM("good", "usable", "bad", name="episode_quality", create_type=False)
request_status = postgresql.ENUM(
    "submitted", "in_progress", "delivered", "accepted", "rejected", name="request_status", create_type=False
)
ENUM_TYPES = (user_role, episode_quality, request_status)


def _timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in ENUM_TYPES:
        enum_type.create(bind, checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("organisation", sa.String(120), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.CheckConstraint("email = lower(email)", name=op.f("ck_users_email_lowercase")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )

    robots = op.create_table(
        "robots",
        sa.Column("id", sa.String(32), primary_key=True),
        _timestamp("created_at"),
    )
    op.bulk_insert(robots, [{"id": robot_id} for robot_id in KNOWN_ROBOTS])

    op.create_table(
        "episodes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("episode_id", sa.String(64, collation="C"), nullable=False),
        sa.Column("robot_id", sa.String(32), sa.ForeignKey("robots.id", name=op.f("fk_episodes_robot_id_robots")), nullable=False),
        sa.Column("task_name", sa.String(200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("operator_name", sa.String(120), nullable=False),
        sa.Column("quality", episode_quality, nullable=False),
        _timestamp("created_at"),
        sa.CheckConstraint("duration_seconds > 0", name=op.f("ck_episodes_duration_positive")),
        sa.UniqueConstraint("episode_id", name=op.f("uq_episodes_episode_id")),
    )
    op.create_index("ix_episodes_recorded_at_robot_id", "episodes", ["recorded_at", "robot_id"])
    op.create_index("ix_episodes_robot_id_recorded_at", "episodes", ["robot_id", "recorded_at"])
    op.create_index("ix_episodes_task_name_quality_recorded_at", "episodes", ["task_name", "quality", "recorded_at"])
    op.create_index(
        "ix_episodes_good_recorded_at_task_name",
        "episodes",
        ["recorded_at", "task_name"],
        postgresql_where=sa.text("quality = 'good'"),
    )

    op.create_table(
        "dataset_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("users.id", name=op.f("fk_dataset_requests_client_id_users")), nullable=False),
        sa.Column("task_name", sa.String(200), nullable=False),
        sa.Column("episodes_requested", sa.Integer(), nullable=False),
        sa.Column("deadline", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", request_status, nullable=False),
        _timestamp("created_at"),
        _timestamp("updated_at"),
        sa.CheckConstraint("episodes_requested > 0", name=op.f("ck_dataset_requests_episodes_requested_positive")),
    )
    op.create_index("ix_dataset_requests_client_id_created_at", "dataset_requests", ["client_id", "created_at"])
    op.create_index("ix_dataset_requests_status", "dataset_requests", ["status"])
    op.create_index("ix_dataset_requests_deadline", "dataset_requests", ["deadline"])

    op.create_table(
        "request_status_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "request_id",
            sa.Integer(),
            sa.ForeignKey("dataset_requests.id", ondelete="CASCADE", name=op.f("fk_request_status_history_request_id_dataset_requests")),
            nullable=False,
        ),
        sa.Column("previous_status", request_status, nullable=True),
        sa.Column("new_status", request_status, nullable=False),
        sa.Column(
            "changed_by_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name=op.f("fk_request_status_history_changed_by_id_users")),
            nullable=False,
        ),
        _timestamp("changed_at"),
        sa.Column("comment", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_request_status_history_request_id_changed_at", "request_status_history", ["request_id", "changed_at"]
    )

    op.create_table(
        "assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "request_id",
            sa.Integer(),
            sa.ForeignKey("dataset_requests.id", ondelete="CASCADE", name=op.f("fk_assignments_request_id_dataset_requests")),
            nullable=False,
        ),
        sa.Column("episode_id", sa.Integer(), sa.ForeignKey("episodes.id", name=op.f("fk_assignments_episode_id_episodes")), nullable=False),
        sa.Column("assigned_by_id", sa.Integer(), sa.ForeignKey("users.id", name=op.f("fk_assignments_assigned_by_id_users")), nullable=False),
        _timestamp("assigned_at"),
        # At most one request per episode, enforced by the database (race-safe).
        sa.UniqueConstraint("episode_id", name=op.f("uq_assignments_episode_id")),
    )
    op.create_index(op.f("ix_assignments_request_id"), "assignments", ["request_id"])


def downgrade() -> None:
    op.drop_table("assignments")
    op.drop_table("request_status_history")
    op.drop_table("dataset_requests")
    op.drop_table("episodes")
    op.drop_table("robots")
    op.drop_table("users")
    bind = op.get_bind()
    for enum_type in reversed(ENUM_TYPES):
        enum_type.drop(bind, checkfirst=True)
