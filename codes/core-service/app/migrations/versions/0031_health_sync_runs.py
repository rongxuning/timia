"""health sync run log and incremental cursor

Revision ID: 0031_health_sync_runs
Revises: 0030_workout_detail
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0031_health_sync_runs"
down_revision = "0030_workout_detail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "health_sync_run",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("from_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("to_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("quantity_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sleep_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stand_hour_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("heartbeat_series_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("workout_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("route_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("upserted", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("local_dates", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("error", sa.String(length=400), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_health_sync_run_owner_started",
        "health_sync_run",
        ["owner_user_id", "started_at"],
    )
    op.create_index("ix_health_sync_run_owner_user_id", "health_sync_run", ["owner_user_id"])
    op.create_table(
        "health_sync_state",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("owner_user_id", name="uq_health_sync_state_owner"),
    )
    op.create_index("ix_health_sync_state_owner_user_id", "health_sync_state", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("ix_health_sync_state_owner_user_id", table_name="health_sync_state")
    op.drop_table("health_sync_state")
    op.drop_index("ix_health_sync_run_owner_user_id", table_name="health_sync_run")
    op.drop_index("ix_health_sync_run_owner_started", table_name="health_sync_run")
    op.drop_table("health_sync_run")
