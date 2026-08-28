"""add health domain tables

Revision ID: 0026_add_health_domain
Revises: 0025_plan_mode_usage_kinds
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0026_add_health_domain"
down_revision = "0025_plan_mode_usage_kinds"
branch_labels = None
depends_on = None


def _timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    ]


def _source_and_deleted():
    return [
        sa.Column("source_bundle_id", sa.String(length=200), nullable=True),
        sa.Column("source_name", sa.String(length=200), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        "health_sample_quantity",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hk_uuid", UUID(as_uuid=True), nullable=False),
        sa.Column("metric_type", sa.String(length=32), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=False),
        *_source_and_deleted(),
        sa.Column("metadata", JSONB, nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_sample_quantity_owner_hk"),
    )
    op.create_index(
        "ix_health_sample_quantity_owner_type_start",
        "health_sample_quantity",
        ["owner_user_id", "metric_type", "start_at"],
    )
    op.create_index(
        "ix_health_sample_quantity_owner_start",
        "health_sample_quantity",
        ["owner_user_id", "start_at"],
    )
    op.create_index("ix_health_sample_quantity_owner_user_id", "health_sample_quantity", ["owner_user_id"])

    op.create_table(
        "health_sample_sleep",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hk_uuid", UUID(as_uuid=True), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stage", sa.String(length=20), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        *_source_and_deleted(),
        *_timestamps(),
        sa.UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_sample_sleep_owner_hk"),
    )
    op.create_index(
        "ix_health_sample_sleep_owner_start",
        "health_sample_sleep",
        ["owner_user_id", "start_at"],
    )
    op.create_index("ix_health_sample_sleep_owner_user_id", "health_sample_sleep", ["owner_user_id"])

    op.create_table(
        "health_sample_stand_hour",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hk_uuid", UUID(as_uuid=True), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stood", sa.Boolean(), nullable=False),
        *_source_and_deleted(),
        *_timestamps(),
        sa.UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_sample_stand_hour_owner_hk"),
    )
    op.create_index(
        "ix_health_sample_stand_hour_owner_start",
        "health_sample_stand_hour",
        ["owner_user_id", "start_at"],
    )
    op.create_index(
        "ix_health_sample_stand_hour_owner_user_id", "health_sample_stand_hour", ["owner_user_id"]
    )

    op.create_table(
        "health_series_heartbeat",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hk_uuid", UUID(as_uuid=True), nullable=False),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("interval_count", sa.Integer(), nullable=False),
        sa.Column("intervals", JSONB, nullable=False),
        *_source_and_deleted(),
        *_timestamps(),
        sa.UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_series_heartbeat_owner_hk"),
    )
    op.create_index(
        "ix_health_series_heartbeat_owner_start",
        "health_series_heartbeat",
        ["owner_user_id", "start_at"],
    )
    op.create_index(
        "ix_health_series_heartbeat_owner_user_id", "health_series_heartbeat", ["owner_user_id"]
    )

    op.create_table(
        "health_workout_session",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("hk_uuid", UUID(as_uuid=True), nullable=False),
        sa.Column("activity_type", sa.String(length=32), nullable=False),
        sa.Column("activity_type_raw", sa.String(length=64), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("active_energy_kcal", sa.Float(), nullable=True),
        sa.Column("distance_m", sa.Float(), nullable=True),
        sa.Column("avg_hr_bpm", sa.Float(), nullable=True),
        sa.Column("max_hr_bpm", sa.Float(), nullable=True),
        *_source_and_deleted(),
        sa.Column("metadata", JSONB, nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_workout_session_owner_hk"),
    )
    op.create_index(
        "ix_health_workout_session_owner_start",
        "health_workout_session",
        ["owner_user_id", "start_at"],
    )
    op.create_index(
        "ix_health_workout_session_owner_user_id", "health_workout_session", ["owner_user_id"]
    )

    op.create_table(
        "health_metrics_daily",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("steps", sa.Float(), nullable=True),
        sa.Column("distance_m", sa.Float(), nullable=True),
        sa.Column("flights_climbed", sa.Float(), nullable=True),
        sa.Column("exercise_minutes", sa.Float(), nullable=True),
        sa.Column("stand_minutes", sa.Float(), nullable=True),
        sa.Column("stand_hours", sa.Integer(), nullable=True),
        sa.Column("basal_energy_kcal", sa.Float(), nullable=True),
        sa.Column("active_energy_kcal", sa.Float(), nullable=True),
        sa.Column("hr_min", sa.Float(), nullable=True),
        sa.Column("hr_avg", sa.Float(), nullable=True),
        sa.Column("hr_max", sa.Float(), nullable=True),
        sa.Column("hr_count", sa.Integer(), nullable=True),
        sa.Column("resting_hr_bpm", sa.Float(), nullable=True),
        sa.Column("hrv_median_ms", sa.Float(), nullable=True),
        sa.Column("spo2_min", sa.Float(), nullable=True),
        sa.Column("spo2_avg", sa.Float(), nullable=True),
        sa.Column("spo2_max", sa.Float(), nullable=True),
        sa.Column("sleep_in_bed_minutes", sa.Float(), nullable=True),
        sa.Column("sleep_asleep_minutes", sa.Float(), nullable=True),
        sa.Column("sleep_deep_minutes", sa.Float(), nullable=True),
        sa.Column("sleep_rem_minutes", sa.Float(), nullable=True),
        sa.Column("sleep_core_minutes", sa.Float(), nullable=True),
        sa.Column("sleep_awake_minutes", sa.Float(), nullable=True),
        sa.Column("body_mass_kg", sa.Float(), nullable=True),
        sa.Column("vo2_max", sa.Float(), nullable=True),
        sa.Column("cardio_recovery_bpm", sa.Float(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("owner_user_id", "local_date", name="uq_health_metrics_daily_owner_date"),
    )
    op.create_index("ix_health_metrics_daily_owner_user_id", "health_metrics_daily", ["owner_user_id"])

    op.create_table(
        "health_insight_daily",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("source_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("trends", JSONB, nullable=True),
        sa.Column("suggestions", JSONB, nullable=True),
        sa.Column("provider", sa.String(length=80), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("owner_user_id", "local_date", name="uq_health_insight_daily_owner_date"),
    )
    op.create_index("ix_health_insight_daily_owner_user_id", "health_insight_daily", ["owner_user_id"])


def downgrade() -> None:
    op.drop_table("health_insight_daily")
    op.drop_table("health_metrics_daily")
    op.drop_table("health_workout_session")
    op.drop_table("health_series_heartbeat")
    op.drop_table("health_sample_stand_hour")
    op.drop_table("health_sample_sleep")
    op.drop_table("health_sample_quantity")
