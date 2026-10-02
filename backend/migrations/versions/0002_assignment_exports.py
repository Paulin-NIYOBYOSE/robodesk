"""Per-assignment export job state (stretch: background export processing).

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-02
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

export_status = postgresql.ENUM("pending", "running", "succeeded", "failed", name="export_status", create_type=False)


def upgrade() -> None:
    export_status.create(op.get_bind(), checkfirst=True)
    # Existing assignments start as pending, so the worker exports them too.
    op.add_column("assignments", sa.Column("export_status", export_status, server_default="pending", nullable=False))
    op.add_column("assignments", sa.Column("export_attempts", sa.Integer(), server_default="0", nullable=False))
    op.add_column(
        "assignments",
        sa.Column("export_next_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.add_column("assignments", sa.Column("export_lease_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("assignments", sa.Column("export_error", sa.Text(), nullable=True))
    op.add_column("assignments", sa.Column("exported_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_assignments_export_due",
        "assignments",
        ["export_next_attempt_at"],
        postgresql_where=sa.text("export_status IN ('pending', 'running')"),
    )


def downgrade() -> None:
    op.drop_index("ix_assignments_export_due", table_name="assignments")
    for column in (
        "exported_at",
        "export_error",
        "export_lease_expires_at",
        "export_next_attempt_at",
        "export_attempts",
        "export_status",
    ):
        op.drop_column("assignments", column)
    export_status.drop(op.get_bind(), checkfirst=True)
