"""Pure rollup helpers for health daily metrics."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.health import (
    SLEEP_STAGE_AWAKE,
    SLEEP_STAGE_CORE,
    SLEEP_STAGE_DEEP,
    SLEEP_STAGE_IN_BED,
    SLEEP_STAGE_REM,
    SLEEP_STAGE_UNSPECIFIED,
)

SLEEP_ASLEEP_STAGES = frozenset(
    {
        SLEEP_STAGE_CORE,
        SLEEP_STAGE_DEEP,
        SLEEP_STAGE_REM,
        SLEEP_STAGE_UNSPECIFIED,
    }
)


def parse_timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, KeyError, ValueError) as exc:
        raise ValueError("invalid_timezone") from exc


def local_date_of(dt: datetime, timezone_name: str) -> date:
    tz = parse_timezone(timezone_name)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=tz)
    return dt.astimezone(tz).date()


def median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def sum_values(values: list[float]) -> float | None:
    if not values:
        return None
    return float(sum(values))


def last_value(rows: list[tuple[datetime, float]]) -> float | None:
    if not rows:
        return None
    rows = sorted(rows, key=lambda item: item[0])
    return rows[-1][1]


def aggregate_sleep_minutes(
    samples: list[dict[str, Any]],
    local_date: date,
    timezone_name: str,
) -> dict[str, float | None]:
    in_bed = 0.0
    core = 0.0
    deep = 0.0
    rem = 0.0
    unspecified = 0.0
    awake = 0.0
    matched = False
    for sample in samples:
        end_at = sample["end_at"]
        if local_date_of(end_at, timezone_name) != local_date:
            continue
        matched = True
        minutes = (end_at - sample["start_at"]).total_seconds() / 60.0
        stage = sample["stage"]
        if stage == SLEEP_STAGE_IN_BED:
            in_bed += minutes
        elif stage == SLEEP_STAGE_CORE:
            core += minutes
        elif stage == SLEEP_STAGE_DEEP:
            deep += minutes
        elif stage == SLEEP_STAGE_REM:
            rem += minutes
        elif stage == SLEEP_STAGE_UNSPECIFIED:
            unspecified += minutes
        elif stage == SLEEP_STAGE_AWAKE:
            awake += minutes
    if not matched:
        return {
            "sleep_in_bed_minutes": None,
            "sleep_asleep_minutes": None,
            "sleep_core_minutes": None,
            "sleep_deep_minutes": None,
            "sleep_rem_minutes": None,
            "sleep_awake_minutes": None,
        }
    asleep = core + deep + rem + unspecified
    saw = {
        sample["stage"]
        for sample in samples
        if local_date_of(sample["end_at"], timezone_name) == local_date
    }
    return {
        "sleep_in_bed_minutes": in_bed if SLEEP_STAGE_IN_BED in saw else None,
        "sleep_asleep_minutes": asleep if bool(saw & SLEEP_ASLEEP_STAGES) else None,
        "sleep_core_minutes": core if SLEEP_STAGE_CORE in saw else None,
        "sleep_deep_minutes": deep if SLEEP_STAGE_DEEP in saw else None,
        "sleep_rem_minutes": rem if SLEEP_STAGE_REM in saw else None,
        "sleep_awake_minutes": awake if SLEEP_STAGE_AWAKE in saw else None,
    }
