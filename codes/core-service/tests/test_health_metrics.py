"""Pure rollup helpers for health daily metrics."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.services.health_metrics import (
    SLEEP_ASLEEP_STAGES,
    aggregate_sleep_minutes,
    local_date_of,
    median,
    sum_cumulative_deduped,
    sum_values,
)


SHANGHAI = ZoneInfo("Asia/Shanghai")


def test_local_date_uses_timezone_not_utc():
    # 2026-08-26 16:30 UTC == 2026-08-27 00:30 in Shanghai
    dt = datetime(2026, 8, 26, 16, 30, tzinfo=ZoneInfo("UTC"))
    assert str(local_date_of(dt, "Asia/Shanghai")) == "2026-08-27"


def test_sleep_asleep_excludes_in_bed():
    night_end = datetime(2026, 8, 27, 7, 0, tzinfo=SHANGHAI)
    samples = [
        {"stage": "in_bed", "start_at": datetime(2026, 8, 26, 23, 0, tzinfo=SHANGHAI), "end_at": night_end},
        {"stage": "core", "start_at": datetime(2026, 8, 26, 23, 30, tzinfo=SHANGHAI), "end_at": datetime(2026, 8, 27, 2, 30, tzinfo=SHANGHAI)},
        {"stage": "deep", "start_at": datetime(2026, 8, 27, 2, 30, tzinfo=SHANGHAI), "end_at": datetime(2026, 8, 27, 4, 0, tzinfo=SHANGHAI)},
        {"stage": "rem", "start_at": datetime(2026, 8, 27, 4, 0, tzinfo=SHANGHAI), "end_at": datetime(2026, 8, 27, 6, 0, tzinfo=SHANGHAI)},
        {"stage": "awake", "start_at": datetime(2026, 8, 27, 6, 0, tzinfo=SHANGHAI), "end_at": datetime(2026, 8, 27, 6, 20, tzinfo=SHANGHAI)},
    ]
    rolled = aggregate_sleep_minutes(samples, local_date_of(night_end, "Asia/Shanghai"), "Asia/Shanghai")
    assert rolled["sleep_in_bed_minutes"] == 8 * 60
    assert rolled["sleep_core_minutes"] == 3 * 60
    assert rolled["sleep_deep_minutes"] == 90
    assert rolled["sleep_rem_minutes"] == 2 * 60
    assert rolled["sleep_awake_minutes"] == 20
    # in_bed must not be added into asleep total
    assert rolled["sleep_asleep_minutes"] == 3 * 60 + 90 + 2 * 60
    assert rolled["sleep_asleep_minutes"] != rolled["sleep_in_bed_minutes"]


def test_sleep_unspecified_counts_as_asleep():
    assert "unspecified" in SLEEP_ASLEEP_STAGES
    start = datetime(2026, 8, 27, 0, 0, tzinfo=SHANGHAI)
    end = datetime(2026, 8, 27, 1, 0, tzinfo=SHANGHAI)
    rolled = aggregate_sleep_minutes(
        [{"stage": "unspecified", "start_at": start, "end_at": end}],
        local_date_of(end, "Asia/Shanghai"),
        "Asia/Shanghai",
    )
    assert rolled["sleep_asleep_minutes"] == 60


def test_sleep_in_bed_null_when_only_asleep_stages():
    start = datetime(2026, 8, 27, 0, 0, tzinfo=SHANGHAI)
    end = datetime(2026, 8, 27, 1, 0, tzinfo=SHANGHAI)
    rolled = aggregate_sleep_minutes(
        [{"stage": "core", "start_at": start, "end_at": end}],
        local_date_of(end, "Asia/Shanghai"),
        "Asia/Shanghai",
    )
    assert rolled["sleep_in_bed_minutes"] is None
    assert rolled["sleep_asleep_minutes"] == 60


def test_sum_values_none_when_empty():
    assert sum_values([]) is None
    assert sum_values([100.0, 20.5]) == 120.5


def test_median_none_when_empty():
    assert median([]) is None
    assert median([1.0, 3.0, 2.0]) == 2.0
    assert median([1.0, 2.0]) == 1.5


def test_sum_cumulative_deduped_empty_and_non_positive():
    assert sum_cumulative_deduped([]) is None
    start = datetime(2026, 8, 27, 8, 0, tzinfo=SHANGHAI)
    end = start + timedelta(hours=1)
    assert sum_cumulative_deduped([(start, end, 0.0), (start, end, -5.0)]) is None


def test_sum_cumulative_deduped_full_overlap_takes_max_not_sum():
    start = datetime(2026, 8, 27, 8, 0, tzinfo=SHANGHAI)
    end = start + timedelta(hours=1)
    total = sum_cumulative_deduped([(start, end, 5000.0), (start, end, 5000.0)])
    assert total is not None
    assert abs(total - 5000.0) < 1e-6


def test_sum_cumulative_deduped_adjacent_non_overlapping():
    start = datetime(2026, 8, 27, 8, 0, tzinfo=SHANGHAI)
    mid = start + timedelta(hours=1)
    end = mid + timedelta(hours=1)
    total = sum_cumulative_deduped([(start, mid, 3000.0), (mid, end, 2000.0)])
    assert total is not None
    assert abs(total - 5000.0) < 1e-6


def test_sum_cumulative_deduped_partial_overlap_max_rate_integral():
    # A: [0h, 2h] = 4000 → rate 2000/h
    # B: [1h, 3h] = 2000 → rate 1000/h
    # Segments: [0,1]=2000, [1,2]=max(2000,1000)=2000, [2,3]=1000 → 5000
    t0 = datetime(2026, 8, 27, 8, 0, tzinfo=SHANGHAI)
    t1 = t0 + timedelta(hours=1)
    t2 = t0 + timedelta(hours=2)
    t3 = t0 + timedelta(hours=3)
    a, b = 4000.0, 2000.0
    total = sum_cumulative_deduped([(t0, t2, a), (t1, t3, b)])
    assert total is not None
    assert abs(total - 5000.0) < 1e-6
    assert max(a, b) < total < a + b


def test_sum_cumulative_deduped_zero_duration_and_missing_end():
    instant = datetime(2026, 8, 27, 9, 0, tzinfo=SHANGHAI)
    total = sum_cumulative_deduped(
        [
            (instant, instant, 100.0),
            (instant, None, 50.0),
        ]
    )
    # Same 1s window → max rate keeps 100, not 150
    assert total is not None
    assert abs(total - 100.0) < 1e-6


def test_sum_cumulative_deduped_timezone_aware_comparable():
    start_utc = datetime(2026, 8, 27, 0, 0, tzinfo=ZoneInfo("UTC"))
    end_utc = start_utc + timedelta(hours=1)
    start_sh = datetime(2026, 8, 27, 8, 0, tzinfo=SHANGHAI)  # same instant as start_utc
    end_sh = start_sh + timedelta(hours=1)
    total = sum_cumulative_deduped([(start_utc, end_utc, 3000.0), (start_sh, end_sh, 2000.0)])
    assert total is not None
    assert abs(total - 3000.0) < 1e-6
