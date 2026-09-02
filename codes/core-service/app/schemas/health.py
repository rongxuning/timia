"""Pydantic schemas for health sync APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class HealthQuantitySampleIn(BaseModel):
    hk_uuid: UUID
    metric_type: str
    start_at: datetime
    end_at: datetime
    value: float
    unit: str = Field(min_length=1, max_length=16)
    source_bundle_id: str | None = Field(default=None, max_length=200)
    source_name: str | None = Field(default=None, max_length=200)
    metadata: dict[str, Any] | None = None


class HealthQuantitySyncIn(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    samples: list[HealthQuantitySampleIn] = Field(default_factory=list)


class HealthSleepSampleIn(BaseModel):
    hk_uuid: UUID
    start_at: datetime
    end_at: datetime
    stage: str
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    source_bundle_id: str | None = Field(default=None, max_length=200)
    source_name: str | None = Field(default=None, max_length=200)


class HealthSleepSyncIn(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    samples: list[HealthSleepSampleIn] = Field(default_factory=list)


class HealthStandHourSampleIn(BaseModel):
    hk_uuid: UUID
    start_at: datetime
    end_at: datetime
    stood: bool
    source_bundle_id: str | None = Field(default=None, max_length=200)
    source_name: str | None = Field(default=None, max_length=200)


class HealthStandHourSyncIn(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    samples: list[HealthStandHourSampleIn] = Field(default_factory=list)


class HealthHeartbeatIntervalIn(BaseModel):
    t: float
    gap: bool = False


class HealthHeartbeatSeriesIn(BaseModel):
    hk_uuid: UUID
    start_at: datetime
    end_at: datetime
    intervals: list[HealthHeartbeatIntervalIn]
    source_bundle_id: str | None = Field(default=None, max_length=200)
    source_name: str | None = Field(default=None, max_length=200)


class HealthHeartbeatSyncIn(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    series: list[HealthHeartbeatSeriesIn] = Field(default_factory=list)


class HealthWorkoutIn(BaseModel):
    hk_uuid: UUID
    activity_type: str = "other"
    activity_type_raw: str | None = Field(default=None, max_length=80)
    start_at: datetime
    end_at: datetime
    duration_seconds: int = Field(ge=0)
    active_energy_kcal: float | None = None
    distance_m: float | None = None
    avg_hr_bpm: float | None = None
    max_hr_bpm: float | None = None
    avg_cadence_spm: float | None = None
    avg_pace_sec_per_km: float | None = None
    elevation_ascended_m: float | None = None
    elevation_descended_m: float | None = None
    weather_temp_c: float | None = None
    weather_humidity: float | None = None
    location_country: str | None = Field(default=None, max_length=64)
    location_admin: str | None = Field(default=None, max_length=64)
    location_city: str | None = Field(default=None, max_length=64)
    source_bundle_id: str | None = Field(default=None, max_length=200)
    source_name: str | None = Field(default=None, max_length=200)
    metadata: dict[str, Any] | None = None


class HealthWorkoutSyncIn(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    workouts: list[HealthWorkoutIn] = Field(default_factory=list)


class HealthRoutePointIn(BaseModel):
    t: float = Field(ge=0)
    lat: float
    lng: float
    alt: float | None = None


class HealthWorkoutRouteIn(BaseModel):
    hk_uuid: UUID
    points: list[HealthRoutePointIn] = Field(min_length=2, max_length=1800)


class HealthWorkoutRouteSyncIn(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    routes: list[HealthWorkoutRouteIn] = Field(default_factory=list)


class HealthDeletionIn(BaseModel):
    hk_uuid: UUID
    kind: str


class HealthDeletionSyncIn(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    deletions: list[HealthDeletionIn] = Field(default_factory=list)


class HealthSyncOut(BaseModel):
    upserted: int
    local_dates: list[str] = Field(default_factory=list)


class HealthSyncDayStatusOut(BaseModel):
    local_date: str
    quantity_count: int = 0
    sleep_count: int = 0
    stand_hour_count: int = 0
    heartbeat_series_count: int = 0
    workout_count: int = 0


class HealthSyncRunIn(BaseModel):
    source: Literal["manual", "background"]
    status: Literal["success", "failed"]
    from_at: datetime | None = None
    to_at: datetime
    quantity_count: int = 0
    sleep_count: int = 0
    stand_hour_count: int = 0
    heartbeat_series_count: int = 0
    workout_count: int = 0
    route_count: int = 0
    upserted: int = 0
    local_dates: list[str] = Field(default_factory=list)
    error: str | None = Field(default=None, max_length=400)


class HealthSyncRunOut(BaseModel):
    id: str
    source: str
    status: str
    started_at: datetime
    finished_at: datetime | None = None
    from_at: datetime | None = None
    to_at: datetime | None = None
    quantity_count: int = 0
    sleep_count: int = 0
    stand_hour_count: int = 0
    heartbeat_series_count: int = 0
    workout_count: int = 0
    route_count: int = 0
    upserted: int = 0
    local_dates: list[str] = Field(default_factory=list)
    error: str | None = None


class HealthSyncStatusOut(BaseModel):
    timezone: str
    last_synced_at: datetime | None = None
    days: list[HealthSyncDayStatusOut] = Field(default_factory=list)
    runs: list[HealthSyncRunOut] = Field(default_factory=list)


class HealthLayoutIn(BaseModel):
    card_order: list[str] = Field(min_length=1, max_length=32)


class HealthLayoutOut(BaseModel):
    card_order: list[str]


class HealthProfileIn(BaseModel):
    sex: str | None = None
    age_years: int | None = Field(default=None, ge=1, le=120)
    height_cm: float | None = Field(default=None, ge=50, le=250)
    max_hr_bpm: int | None = None


class HealthProfileOut(BaseModel):
    sex: str | None = None
    age_years: int | None = None
    height_cm: float | None = None
    max_hr_bpm: int | None = None
