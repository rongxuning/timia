"""Health domain models — personal, owner-scoped, no workspace."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin

METRIC_HEART_RATE = "heart_rate"
METRIC_RESTING_HEART_RATE = "resting_heart_rate"
METRIC_HRV_SDNN = "hrv_sdnn"
METRIC_BASAL_ENERGY = "basal_energy"
METRIC_ACTIVE_ENERGY = "active_energy"
METRIC_STEP_COUNT = "step_count"
METRIC_DISTANCE_WALKING_RUNNING = "distance_walking_running"
METRIC_DISTANCE_CYCLING = "distance_cycling"
METRIC_FLIGHTS_CLIMBED = "flights_climbed"
METRIC_EXERCISE_TIME = "exercise_time"
METRIC_STAND_TIME = "stand_time"
METRIC_BODY_MASS = "body_mass"
METRIC_OXYGEN_SATURATION = "oxygen_saturation"
METRIC_VO2_MAX = "vo2_max"
METRIC_CARDIO_RECOVERY = "cardio_recovery"
METRIC_RUNNING_SPEED = "running_speed"
METRIC_RUNNING_STRIDE = "running_stride"
METRIC_RUNNING_POWER = "running_power"
METRIC_RUNNING_VERTICAL_OSC = "running_vertical_oscillation"
METRIC_RUNNING_GROUND_CONTACT = "running_ground_contact"

QUANTITY_METRIC_TYPES = frozenset(
    {
        METRIC_HEART_RATE,
        METRIC_RESTING_HEART_RATE,
        METRIC_HRV_SDNN,
        METRIC_BASAL_ENERGY,
        METRIC_ACTIVE_ENERGY,
        METRIC_STEP_COUNT,
        METRIC_DISTANCE_WALKING_RUNNING,
        METRIC_DISTANCE_CYCLING,
        METRIC_FLIGHTS_CLIMBED,
        METRIC_EXERCISE_TIME,
        METRIC_STAND_TIME,
        METRIC_BODY_MASS,
        METRIC_OXYGEN_SATURATION,
        METRIC_VO2_MAX,
        METRIC_CARDIO_RECOVERY,
        METRIC_RUNNING_SPEED,
        METRIC_RUNNING_STRIDE,
        METRIC_RUNNING_POWER,
        METRIC_RUNNING_VERTICAL_OSC,
        METRIC_RUNNING_GROUND_CONTACT,
    }
)

SLEEP_STAGE_IN_BED = "in_bed"
SLEEP_STAGE_AWAKE = "awake"
SLEEP_STAGE_CORE = "core"
SLEEP_STAGE_DEEP = "deep"
SLEEP_STAGE_REM = "rem"
SLEEP_STAGE_UNSPECIFIED = "unspecified"

SLEEP_STAGES = frozenset(
    {
        SLEEP_STAGE_IN_BED,
        SLEEP_STAGE_AWAKE,
        SLEEP_STAGE_CORE,
        SLEEP_STAGE_DEEP,
        SLEEP_STAGE_REM,
        SLEEP_STAGE_UNSPECIFIED,
    }
)

INSIGHT_PENDING = "pending"
INSIGHT_SUCCESS = "success"
INSIGHT_FAILED = "failed"

DELETION_KIND_QUANTITY = "quantity"
DELETION_KIND_SLEEP = "sleep"
DELETION_KIND_STAND_HOUR = "stand_hour"
DELETION_KIND_HEARTBEAT_SERIES = "heartbeat_series"
DELETION_KIND_WORKOUT = "workout"

DELETION_KINDS = frozenset(
    {
        DELETION_KIND_QUANTITY,
        DELETION_KIND_SLEEP,
        DELETION_KIND_STAND_HOUR,
        DELETION_KIND_HEARTBEAT_SERIES,
        DELETION_KIND_WORKOUT,
    }
)

class HealthSampleQuantity(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_sample_quantity"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_sample_quantity_owner_hk"),
        Index(
            "ix_health_sample_quantity_owner_type_start",
            "owner_user_id",
            "metric_type",
            "start_at",
        ),
        Index("ix_health_sample_quantity_owner_start", "owner_user_id", "start_at"),
        Index(
            "ix_health_sample_quantity_owner_type_start_alive",
            "owner_user_id",
            "metric_type",
            "start_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "ix_health_sample_quantity_owner_start_alive",
            "owner_user_id",
            "start_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hk_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    metric_type: Mapped[str] = mapped_column(String(32), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(16), nullable=False)
    source_bundle_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HealthSampleSleep(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_sample_sleep"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_sample_sleep_owner_hk"),
        Index("ix_health_sample_sleep_owner_start", "owner_user_id", "start_at"),
        Index(
            "ix_health_sample_sleep_owner_start_alive",
            "owner_user_id",
            "start_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hk_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stage: Mapped[str] = mapped_column(String(20), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    source_bundle_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HealthSampleStandHour(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_sample_stand_hour"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_sample_stand_hour_owner_hk"),
        Index("ix_health_sample_stand_hour_owner_start", "owner_user_id", "start_at"),
        Index(
            "ix_health_sample_stand_hour_owner_start_alive",
            "owner_user_id",
            "start_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hk_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    stood: Mapped[bool] = mapped_column(Boolean, nullable=False)
    source_bundle_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HealthSeriesHeartbeat(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_series_heartbeat"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_series_heartbeat_owner_hk"),
        Index("ix_health_series_heartbeat_owner_start", "owner_user_id", "start_at"),
        Index(
            "ix_health_series_heartbeat_owner_start_alive",
            "owner_user_id",
            "start_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hk_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    interval_count: Mapped[int] = mapped_column(Integer, nullable=False)
    intervals: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    source_bundle_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HealthWorkoutSession(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_workout_session"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "hk_uuid", name="uq_health_workout_session_owner_hk"),
        Index("ix_health_workout_session_owner_start", "owner_user_id", "start_at"),
        Index(
            "ix_health_workout_session_owner_start_alive",
            "owner_user_id",
            "start_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hk_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    activity_type: Mapped[str] = mapped_column(String(32), nullable=False)
    activity_type_raw: Mapped[str | None] = mapped_column(String(80), nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    active_energy_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_hr_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hr_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_cadence_spm: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_pace_sec_per_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation_ascended_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation_descended_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_temp_c: Mapped[float | None] = mapped_column(Float, nullable=True)
    weather_humidity: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_country: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location_admin: Mapped[str | None] = mapped_column(String(64), nullable=True)
    location_city: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source_bundle_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    extra_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB, nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HealthWorkoutRoute(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """GPS route points for a workout session, keyed by HealthKit workout UUID."""

    __tablename__ = "health_workout_route"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "workout_hk_uuid", name="uq_health_workout_route_owner_hk"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    workout_hk_uuid: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    points: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)
    point_count: Mapped[int] = mapped_column(Integer, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class HealthProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Self-reported sex, age, and height for energy scoring. One row per owner."""

    __tablename__ = "health_profiles"
    __table_args__ = (UniqueConstraint("owner_user_id", name="uq_health_profiles_owner"),)

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sex: Mapped[str | None] = mapped_column(String(16), nullable=True)
    age_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hr_bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)


class HealthMetricsDaily(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_metrics_daily"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "local_date", name="uq_health_metrics_daily_owner_date"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)

    steps: Mapped[float | None] = mapped_column(Float, nullable=True)
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    flights_climbed: Mapped[float | None] = mapped_column(Float, nullable=True)
    exercise_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    stand_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    stand_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    basal_energy_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    active_energy_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    hr_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resting_hr_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hrv_median_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    spo2_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    spo2_avg: Mapped[float | None] = mapped_column(Float, nullable=True)
    spo2_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_in_bed_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_asleep_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_deep_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_rem_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_core_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    sleep_awake_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_mass_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    vo2_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    cardio_recovery_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)


class HealthInsightDaily(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "health_insight_daily"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "local_date", name="uq_health_insight_daily_owner_date"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    local_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    source_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary: Mapped[str | None] = mapped_column(String, nullable=True)
    trends: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    suggestions: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)


class HealthMetricsLayout(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Personal card order for the 健康数据 grid. One row per owner."""

    __tablename__ = "health_metrics_layout"
    __table_args__ = (
        UniqueConstraint("owner_user_id", name="uq_health_metrics_layout_owner"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_order: Mapped[list[Any]] = mapped_column(JSONB, nullable=False)


class HealthSyncRun(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One completed health sync attempt (manual or background)."""

    __tablename__ = "health_sync_run"
    __table_args__ = (Index("ix_health_sync_run_owner_started", "owner_user_id", "started_at"),)

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    from_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    to_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    quantity_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sleep_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    stand_hour_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    heartbeat_series_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    workout_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    route_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    upserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    local_dates: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    error: Mapped[str | None] = mapped_column(String(400), nullable=True)


class HealthSyncState(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """High-water mark for incremental HealthKit sync. One row per owner."""

    __tablename__ = "health_sync_state"
    __table_args__ = (UniqueConstraint("owner_user_id", name="uq_health_sync_state_owner"),)

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
