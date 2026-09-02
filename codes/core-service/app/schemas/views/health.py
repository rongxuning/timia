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
    elevation_ascended_m: float | None = None
    elevation_descended_m: float | None = None
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


class HealthHourBucketOut(BaseModel):
    hour: int
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
    hourly: dict[str, list[HealthHourBucketOut]] = Field(default_factory=dict)
    insight: HealthInsightOut | None = None
    insights: list[HealthInsightOut] = Field(default_factory=list)
    profile: HealthProfileViewOut | None = None
    energy_targets: HealthEnergyTargetsOut | None = None


class HealthProfileViewOut(BaseModel):
    sex: str | None = None
    age_years: int | None = None
    height_cm: float | None = None
    max_hr_bpm: int | None = None


class HealthEnergyTargetsOut(BaseModel):
    bmr_kcal: float
    active_target_kcal: float


class HealthWorkoutsPageOut(BaseModel):
    timezone: str
    start_date: str
    end_date: str
    days: int
    workouts: list[HealthWorkoutOut] = Field(default_factory=list)
    has_more: bool = False


class HealthOffsetPointOut(BaseModel):
    offset_seconds: float
    value: float


class HealthSeriesWindowOut(BaseModel):
    points: list[HealthOffsetPointOut] = Field(default_factory=list)
    avg: float | None = None
    max: float | None = None


class HealthZoneShareOut(BaseModel):
    zone: int | str
    lo: float
    hi: float
    seconds: float
    ratio: float


class HealthKmMarkerOut(BaseModel):
    km: int
    lat: float
    lng: float


class HealthRoutePointOut(BaseModel):
    t: float
    lat: float
    lng: float
    alt: float | None = None


class HealthRouteOut(BaseModel):
    points: list[HealthRoutePointOut] = Field(default_factory=list)
    km_markers: list[HealthKmMarkerOut] = Field(default_factory=list)


class HealthSplitOut(BaseModel):
    lap: int
    duration_seconds: float
    distance_m: float
    pace_sec_per_km: float | None = None
    avg_hr_bpm: float | None = None
    avg_cadence_spm: float | None = None
    is_total: bool = False


class HealthWorkoutSeriesOut(BaseModel):
    pace: HealthSeriesWindowOut | None = None
    cadence: HealthSeriesWindowOut | None = None
    stride: HealthSeriesWindowOut | None = None
    power: HealthSeriesWindowOut | None = None
    vertical_oscillation: HealthSeriesWindowOut | None = None
    ground_contact: HealthSeriesWindowOut | None = None
    altitude: HealthSeriesWindowOut | None = None


class HealthWorkoutDetailOut(HealthWorkoutOut):
    stride_m: float | None = None
    running_index: float | None = None
    running_power_w: float | None = None
    training_load: float | None = None
    trimp: float | None = None
    rtss: float | None = None
    hr_max_used: float | None = None
    hr_rest_used: float | None = None
    running_index_formula: HealthScoreFormulaOut | None = None
    training_load_formula: HealthScoreFormulaOut | None = None
    trimp_formula: HealthScoreFormulaOut | None = None
    route: HealthRouteOut | None = None
    splits: list[HealthSplitOut] | None = None
    heart_rate: HealthSeriesWindowOut | None = None
    heart_rate_zones: list[HealthZoneShareOut] | None = None
    series: HealthWorkoutSeriesOut
    pace_zones: list[HealthZoneShareOut] | None = None


class HealthStandCellOut(BaseModel):
    hour: int
    stood: bool | None = None


class HealthSitStreakOut(BaseModel):
    start_hour: int
    hours: int


class HealthSamplePointOut(BaseModel):
    at: str
    value: float
    window: str | None = None


class HealthSleepSegmentOut(BaseModel):
    start_at: str
    end_at: str
    stage: str


class HealthSleepNightOut(BaseModel):
    local_date: str
    bedtime: str | None = None
    wake_at: str | None = None
    in_bed_minutes: float | None = None
    asleep_minutes: float | None = None
    efficiency: float | None = None
    deep_minutes: float | None = None
    rem_minutes: float | None = None
    core_minutes: float | None = None
    awake_minutes: float | None = None
    unspecified_minutes: float | None = None
    score: int | None = None
    segments: list[HealthSleepSegmentOut] = Field(default_factory=list)


class HealthHeartbeatPreviewOut(BaseModel):
    start_at: str
    interval_count: int
    intervals_ms: list[float] = Field(default_factory=list)


class HealthHrvDayOut(BaseModel):
    local_date: str
    score: int | None = None
    hrv_median_ms: float | None = None
    resting_hr_bpm: float | None = None
    high_minutes: float | None = None
    good_minutes: float | None = None
    mid_minutes: float | None = None
    low_minutes: float | None = None
    high_ratio: float | None = None
    good_ratio: float | None = None
    mid_ratio: float | None = None
    low_ratio: float | None = None


class HealthSpo2DayOut(BaseModel):
    local_date: str
    score: int | None = None
    spo2_avg: float | None = None
    spo2_min: float | None = None
    spo2_max: float | None = None
    spo2_day_avg: float | None = None
    spo2_night_avg: float | None = None
    high_minutes: float | None = None
    good_minutes: float | None = None
    mid_minutes: float | None = None
    low_minutes: float | None = None
    high_ratio: float | None = None
    good_ratio: float | None = None
    mid_ratio: float | None = None
    low_ratio: float | None = None


class HealthRecoveryLinkOut(BaseModel):
    at: str
    value: float
    workout: HealthWorkoutOut | None = None
    possibly_late: bool = False


class HealthCardDetailOut(BaseModel):
    metric: str
    timezone: str
    mode: str
    focus_date: str
    range_start: str | None = None
    range_end: str | None = None
    hourly: list[HealthHourBucketOut] = Field(default_factory=list)
    hourly_heart_rate: list[HealthHourBucketOut] = Field(default_factory=list)
    stats: dict[str, float | None] = Field(default_factory=dict)
    workouts: list[HealthWorkoutOut] = Field(default_factory=list)
    stand_cells: list[HealthStandCellOut] = Field(default_factory=list)
    sit_streaks: list[HealthSitStreakOut] = Field(default_factory=list)
    samples: list[HealthSamplePointOut] = Field(default_factory=list)
    sleep: HealthSleepNightOut | None = None
    sleep_nights: list[HealthSleepNightOut] = Field(default_factory=list)
    hrv_days: list[HealthHrvDayOut] = Field(default_factory=list)
    spo2_days: list[HealthSpo2DayOut] = Field(default_factory=list)
    bedtime_std_minutes: float | None = None
    heartbeat: HealthHeartbeatPreviewOut | None = None
    recovery_links: list[HealthRecoveryLinkOut] = Field(default_factory=list)
