"""View schemas for the personal health page."""

from __future__ import annotations

from pydantic import BaseModel, Field


class HealthCurrentOut(BaseModel):
    steps: float | None = None
    distance_m: float | None = None
    flights_climbed: float | None = None
    exercise_minutes: float | None = None
    stand_hours: float | None = None
    stand_minutes: float | None = None
    basal_energy_kcal: float | None = None
    active_energy_kcal: float | None = None
    resting_hr_bpm: float | None = None
    hr_min: float | None = None
    hr_avg: float | None = None
    hr_max: float | None = None
    hrv_median_ms: float | None = None
    spo2_avg: float | None = None
    body_mass_kg: float | None = None
    vo2_max: float | None = None
    cardio_recovery_bpm: float | None = None
    sleep_in_bed_minutes: float | None = None
    sleep_asleep_minutes: float | None = None
    sleep_deep_minutes: float | None = None
    sleep_rem_minutes: float | None = None
    sleep_core_minutes: float | None = None


class HealthWorkoutOut(BaseModel):
    id: str
    hk_uuid: str
    activity_type: str
    activity_type_raw: str | None = None
    start_at: str
    end_at: str
    duration_seconds: int
    active_energy_kcal: float | None = None
    distance_m: float | None = None
    avg_hr_bpm: float | None = None
    max_hr_bpm: float | None = None
    avg_cadence_spm: float | None = None
    avg_pace_sec_per_km: float | None = None
    weather_temp_c: float | None = None
    weather_humidity: float | None = None
    location_country: str | None = None
    location_admin: str | None = None
    location_city: str | None = None


class HealthScoreFormulaOut(BaseModel):
    formula: str
    hint: str


class HealthSeriesPointOut(BaseModel):
    local_date: str
    value: float | None = None
    min: float | None = None
    max: float | None = None


class HealthInsightOut(BaseModel):
    local_date: str
    status: str
    summary: str | None = None
    trends: list[str] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)


class HealthCalendarDayOut(BaseModel):
    local_date: str
    has_metrics: bool = False
    has_workout: bool = False
    has_insight: bool = False


class MyHealthViewOut(BaseModel):
    timezone: str
    mode: str = "day"
    selected_date: str | None = None
    range_days: int | None = None
    month: str
    calendar_days: list[HealthCalendarDayOut] = Field(default_factory=list)
    current: HealthCurrentOut
    totals: HealthCurrentOut | None = None
    scores: dict[str, int | None] = Field(default_factory=dict)
    score_formulas: dict[str, HealthScoreFormulaOut] = Field(default_factory=dict)
    card_order: list[str] = Field(default_factory=list)
    recent_workouts: list[HealthWorkoutOut] = Field(default_factory=list)
    workout_start_date: str | None = None
    workout_end_date: str | None = None
    workout_has_more: bool = False
    series: dict[str, list[HealthSeriesPointOut]] = Field(default_factory=dict)
    insight: HealthInsightOut | None = None
    insights: list[HealthInsightOut] = Field(default_factory=list)


class HealthWorkoutsPageOut(BaseModel):
    timezone: str
    start_date: str
    end_date: str
    days: int
    workouts: list[HealthWorkoutOut] = Field(default_factory=list)
    has_more: bool = False
