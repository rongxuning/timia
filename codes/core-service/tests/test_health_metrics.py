"""Pure rollup helpers for health daily metrics."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.health_metrics import (
    SLEEP_ASLEEP_STAGES,
    aggregate_sleep_minutes,
    local_date_of,
    median,
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
