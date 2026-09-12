"""split health / workout sync watermarks and dirty dates

Revision ID: 0033_health_split_sync
Revises: 0032_health_partial_indexes
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0033_health_split_sync"
down_revision = "0032_health_partial_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "health_sync_state",
        sa.Column("last_health_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "health_sync_state",
        sa.Column("last_workout_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "health_sync_state",
        sa.Column("last_health_run_id", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "health_sync_state",
        sa.Column("last_workout_run_id", UUID(as_uuid=True), nullable=True),
    )
    op.drop_column("health_sync_state", "last_synced_at")
    op.drop_column("health_sync_state", "last_run_id")

    op.add_column(
        "health_sync_run",
        sa.Column("pipeline", sa.String(length=20), nullable=False, server_default="health"),
    )
    op.alter_column("health_sync_run", "pipeline", server_default=None)

    op.create_table(
        "health_metrics_dirty",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("owner_user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_user_id", "local_date", name="uq_health_metrics_dirty_owner_date"),
    )
    op.create_index(
        "ix_health_metrics_dirty_owner_user_id", "health_metrics_dirty", ["owner_user_id"]
    )
    op.create_index("ix_health_metrics_dirty_date", "health_metrics_dirty", ["local_date"])


def downgrade() -> None:
    op.drop_index("ix_health_metrics_dirty_date", table_name="health_metrics_dirty")
    op.drop_index("ix_health_metrics_dirty_owner_user_id", table_name="health_metrics_dirty")
    op.drop_table("health_metrics_dirty")

    op.drop_column("health_sync_run", "pipeline")

    op.add_column(
        "health_sync_state",
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("health_sync_state", sa.Column("last_run_id", UUID(as_uuid=True), nullable=True))
    op.drop_column("health_sync_state", "last_workout_run_id")
    op.drop_column("health_sync_state", "last_health_run_id")
    op.drop_column("health_sync_state", "last_workout_synced_at")
    op.drop_column("health_sync_state", "last_health_synced_at")
