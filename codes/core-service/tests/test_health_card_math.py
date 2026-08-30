"""Unit tests for health card detail math."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.models.health import (
    SLEEP_STAGE_AWAKE,
    SLEEP_STAGE_CORE,
    SLEEP_STAGE_DEEP,
    SLEEP_STAGE_IN_BED,
    SLEEP_STAGE_REM,
)
from app.services.health_card_math import (
    bedtime_std_minutes,
    bucket_cumulative,
    match_recovery_workout,
    sit_streaks,
    sleep_night,
    split_interval_into_hours,
    stand_cells,
    weight_slope_kg_per_week,
)

TZ = "Asia/Shanghai"
SH = ZoneInfo(TZ)


def test_split_interval_allocates_across_hours():
    start = datetime(2026, 8, 29, 9, 30, tzinfo=SH)
    end = datetime(2026, 8, 29, 11, 0, tzinfo=SH)
    shares = dict(split_interval_into_hours(start, end, 90, TZ, start.date()))
    assert round(shares[9]) == 30
    assert round(shares[10]) == 60


def test_bucket_cumulative_fills_empty_hours_with_zero_when_any_sample():
    start = datetime(2026, 8, 29, 8, 0, tzinfo=SH)
    end = datetime(2026, 8, 29, 9, 0, tzinfo=SH)
    buckets = bucket_cumulative([(start, end, 1000)], TZ, start.date())
    assert buckets[8]["value"] == 1000
    assert buckets[7]["value"] == 0
    assert buckets[9]["value"] == 0


def test_stand_cells_and_sit_streaks():
    day = datetime(2026, 8, 29, 0, tzinfo=SH).date()
    rows = []
    for hour in range(24):
        stood = hour not in {10, 11, 12, 13}
        rows.append((datetime(2026, 8, 29, hour, tzinfo=SH), stood))
    cells = stand_cells(rows, TZ, day)
    streaks = sit_streaks(cells)
    assert streaks == [{"start_hour": 10, "hours": 4}]


def test_sleep_night_efficiency_excludes_in_bed_from_asleep():
    day = datetime(2026, 8, 29, 0, tzinfo=SH).date()
    samples = [
        {
            "stage": SLEEP_STAGE_IN_BED,
            "start_at": datetime(2026, 8, 28, 23, 0, tzinfo=SH),
            "end_at": datetime(2026, 8, 29, 7, 0, tzinfo=SH),
            "timezone": TZ,
        },
        {
            "stage": SLEEP_STAGE_CORE,
            "start_at": datetime(2026, 8, 28, 23, 30, tzinfo=SH),
            "end_at": datetime(2026, 8, 29, 4, 0, tzinfo=SH),
            "timezone": TZ,
        },
        {
            "stage": SLEEP_STAGE_DEEP,
            "start_at": datetime(2026, 8, 29, 4, 0, tzinfo=SH),
            "end_at": datetime(2026, 8, 29, 5, 0, tzinfo=SH),
            "timezone": TZ,
        },
        {
            "stage": SLEEP_STAGE_REM,
            "start_at": datetime(2026, 8, 29, 5, 0, tzinfo=SH),
            "end_at": datetime(2026, 8, 29, 6, 30, tzinfo=SH),
            "timezone": TZ,
        },
    ]
    night = sleep_night(samples, day, TZ, include_segments=True)
    assert night is not None
    assert night["in_bed_minutes"] == 8 * 60
    assert night["asleep_minutes"] == 7 * 60
    assert abs((night["efficiency"] or 0) - 7 / 8) < 1e-6
    assert len(night["segments"]) == 4


def test_sleep_night_efficiency_uses_span_when_no_in_bed():
    day = datetime(2026, 8, 29, 0, tzinfo=SH).date()
    samples = [
        {
            "stage": SLEEP_STAGE_CORE,
            "start_at": datetime(2026, 8, 28, 23, 0, tzinfo=SH),
            "end_at": datetime(2026, 8, 29, 6, 0, tzinfo=SH),
            "timezone": TZ,
        },
        {
            "stage": SLEEP_STAGE_AWAKE,
            "start_at": datetime(2026, 8, 29, 6, 0, tzinfo=SH),
            "end_at": datetime(2026, 8, 29, 6, 30, tzinfo=SH),
            "timezone": TZ,
        },
        {
            "stage": SLEEP_STAGE_DEEP,
            "start_at": datetime(2026, 8, 29, 6, 30, tzinfo=SH),
            "end_at": datetime(2026, 8, 29, 7, 0, tzinfo=SH),
            "timezone": TZ,
        },
    ]
    night = sleep_night(samples, day, TZ, include_segments=False)
    assert night is not None
    assert night["in_bed_minutes"] is None
    assert night["asleep_minutes"] == 7.5 * 60
    assert abs((night["efficiency"] or 0) - 7.5 / 8) < 1e-6


def test_weight_slope_kg_per_week():
    t0 = datetime(2026, 8, 1, 8, tzinfo=SH)
    t1 = datetime(2026, 8, 15, 8, tzinfo=SH)
    slope = weight_slope_kg_per_week([(t0, 70.0), (t1, 69.0)])
    assert slope is not None
    assert round(slope, 2) == round(-0.5, 2)


def test_bedtime_std_minutes_stable_nights():
    nights = [
        {"bedtime": datetime(2026, 8, 27, 23, 0, tzinfo=SH).isoformat()},
        {"bedtime": datetime(2026, 8, 28, 23, 10, tzinfo=SH).isoformat()},
        {"bedtime": datetime(2026, 8, 29, 22, 50, tzinfo=SH).isoformat()},
    ]
    std = bedtime_std_minutes(nights, TZ)
    assert std is not None
    assert std < 20


def test_recovery_match_flags_late_gap():
    end = datetime(2026, 8, 29, 18, 0, tzinfo=SH)
    sample = datetime(2026, 8, 29, 18, 12, tzinfo=SH)
    matched, late = match_recovery_workout(sample, [(end, end, "w")])
    assert matched == "w"
    assert late is True
