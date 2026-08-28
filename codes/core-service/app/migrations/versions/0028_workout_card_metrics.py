"""add workout cadence pace weather location

Revision ID: 0028_workout_card_metrics
Revises: 0027_health_layout_activity
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0028_workout_card_metrics"
down_revision = "0027_health_layout_activity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("health_workout_session", sa.Column("avg_cadence_spm", sa.Float(), nullable=True))
    op.add_column(
        "health_workout_session", sa.Column("avg_pace_sec_per_km", sa.Float(), nullable=True)
    )
    op.add_column("health_workout_session", sa.Column("weather_temp_c", sa.Float(), nullable=True))
    op.add_column(
        "health_workout_session", sa.Column("weather_humidity", sa.Float(), nullable=True)
    )
    op.add_column(
        "health_workout_session", sa.Column("location_country", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "health_workout_session", sa.Column("location_admin", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "health_workout_session", sa.Column("location_city", sa.String(length=64), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("health_workout_session", "location_city")
    op.drop_column("health_workout_session", "location_admin")
    op.drop_column("health_workout_session", "location_country")
    op.drop_column("health_workout_session", "weather_humidity")
    op.drop_column("health_workout_session", "weather_temp_c")
    op.drop_column("health_workout_session", "avg_pace_sec_per_km")
    op.drop_column("health_workout_session", "avg_cadence_spm")
