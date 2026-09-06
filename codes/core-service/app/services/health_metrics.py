"""Pure rollup helpers for health daily metrics."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
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

# Instant / missing-end samples get a 1s window so rate math stays uniform.
_POINT_DURATION = timedelta(seconds=1)

SLEEP_ASLEEP_STAGES = frozenset(
    {
        SLEEP_STAGE_CORE,
        SLEEP_STAGE_DEEP,
        SLEEP_STAGE_REM,
        SLEEP_STAGE_UNSPECIFIED,
    }
)

# iOS TimeZone(secondsFromGMT:) identifiers look like GMT+0800 / UTC+8.
_FIXED_OFFSET_TZ = re.compile(
    r"^(?:GMT|UTC)(?P<sign>[+-])(?P<hours>\d{1,2})(?::?(?P<minutes>\d{2}))?$",
    re.IGNORECASE,
)


def normalize_timezone_name(name: str) -> str:
    """Map common client aliases to IANA / Etc zones ZoneInfo understands."""
    text = (name or "").strip()
    if not text:
        raise ValueError("invalid_timezone")
    try:
        ZoneInfo(text)
        return text
    except (ZoneInfoNotFoundError, KeyError, ValueError):
        pass

    match = _FIXED_OFFSET_TZ.fullmatch(text)
    if match is None:
        raise ValueError("invalid_timezone")
    hours = int(match.group("hours"))
    minutes = int(match.group("minutes") or "0")
    if hours > 14 or minutes > 59:
        raise ValueError("invalid_timezone")
    if minutes != 0:
        # Etc/GMT only supports whole-hour offsets.
        raise ValueError("invalid_timezone")
    # POSIX Etc/GMT sign is inverted vs civil GMT+N.
    offset_hours = hours if match.group("sign") == "+" else -hours
    if offset_hours == 0:
        return "Etc/GMT"
    etc_sign = "-" if offset_hours > 0 else "+"
    return f"Etc/GMT{etc_sign}{abs(offset_hours)}"


def parse_timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(normalize_timezone_name(name))
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


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def cumulative_rate_intervals(
    samples: list[tuple[datetime, datetime | None, float]],
) -> list[tuple[datetime, datetime, float]]:
    """Normalize cumulative samples to (start, end, rate) with rate = value / seconds.

    Non-positive values are skipped. Zero-duration or missing end uses a 1-second window.
    """
    intervals: list[tuple[datetime, datetime, float]] = []
    for start_at, end_at, value in samples:
        try:
            amount = float(value)
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue
        start = _aware(start_at)
        if end_at is None:
            end = start + _POINT_DURATION
        else:
            end = _aware(end_at)
            if end <= start:
                end = start + _POINT_DURATION
        duration = (end - start).total_seconds()
        if duration <= 0:
            continue
        intervals.append((start, end, amount / duration))
    return intervals


def max_rate_segments(
    intervals: list[tuple[datetime, datetime, float]],
) -> list[tuple[datetime, datetime, float]]:
    """Sweep timeline; on overlaps keep the max rate (Apple-style cumulative dedupe)."""
    if not intervals:
        return []
    points = sorted({bound for start, end, _ in intervals for bound in (start, end)})
    segments: list[tuple[datetime, datetime, float]] = []
    for index in range(len(points) - 1):
        t0 = points[index]
        t1 = points[index + 1]
        if t1 <= t0:
            continue
        max_rate = 0.0
        for start, end, rate in intervals:
            if start <= t0 and end >= t1 and rate > max_rate:
                max_rate = rate
        if max_rate > 0:
            segments.append((t0, t1, max_rate))
    return segments


def sum_cumulative_deduped(
    samples: list[tuple[datetime, datetime | None, float]],
) -> float | None:
    """Sum cumulative quantity samples with Apple-style overlap avoidance.

    Each sample is treated as a uniform rate over ``[start_at, end_at]``. Where
    intervals overlap, the highest rate is kept (not summed), then rate×dt is
    integrated. Empty / no positive samples → ``None`` (same contract as
    ``sum_values``).
    """
    intervals = cumulative_rate_intervals(samples)
    if not intervals:
        return None
    total = 0.0
    for start, end, rate in max_rate_segments(intervals):
        total += rate * (end - start).total_seconds()
    return float(total)


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
