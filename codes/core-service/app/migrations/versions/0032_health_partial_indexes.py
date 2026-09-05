"""partial indexes for active health samples

Revision ID: 0032_health_partial_indexes
Revises: 0031_health_sync_runs
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0032_health_partial_indexes"
down_revision = "0031_health_sync_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Table/column names must match app/models/health.py
    op.create_index(
        "ix_health_sample_quantity_owner_type_start_alive",
        "health_sample_quantity",
        ["owner_user_id", "metric_type", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_sample_quantity_owner_start_alive",
        "health_sample_quantity",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_sample_sleep_owner_start_alive",
        "health_sample_sleep",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_sample_stand_hour_owner_start_alive",
        "health_sample_stand_hour",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_series_heartbeat_owner_start_alive",
        "health_series_heartbeat",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_workout_session_owner_start_alive",
        "health_workout_session",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_health_workout_session_owner_start_alive", table_name="health_workout_session")
    op.drop_index("ix_health_series_heartbeat_owner_start_alive", table_name="health_series_heartbeat")
    op.drop_index("ix_health_sample_stand_hour_owner_start_alive", table_name="health_sample_stand_hour")
    op.drop_index("ix_health_sample_sleep_owner_start_alive", table_name="health_sample_sleep")
    op.drop_index("ix_health_sample_quantity_owner_start_alive", table_name="health_sample_quantity")
    op.drop_index("ix_health_sample_quantity_owner_type_start_alive", table_name="health_sample_quantity")
