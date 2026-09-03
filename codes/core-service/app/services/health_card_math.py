"""Pure helpers for health card detail charts. No DB, no HTTP."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from app.models.health import (
    SLEEP_STAGE_AWAKE,
    SLEEP_STAGE_CORE,
    SLEEP_STAGE_DEEP,
    SLEEP_STAGE_IN_BED,
    SLEEP_STAGE_REM,
    SLEEP_STAGE_UNSPECIFIED,
)
from app.services.health_metrics import (
    SLEEP_ASLEEP_STAGES,
    cumulative_rate_intervals,
    local_date_of,
    max_rate_segments,
    parse_timezone,
)

WAKE_START_HOUR = 8
WAKE_END_HOUR = 22
RECOVERY_MATCH_SECONDS = 30 * 60
RECOVERY_LATE_SECONDS = 8 * 60
HEARTBEAT_INTERVAL_CAP = 180
VO2_ACTIVITY_TYPES = frozenset({"running", "walking", "hiking", "xc_skiing"})
NIGHT_HOURS = frozenset(list(range(22, 24)) + list(range(0, 8)))


def aware(dt: datetime, timezone_name: str) -> datetime:
    tz = parse_timezone(timezone_name)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def local_day_bounds(local_date: date, timezone_name: str) -> tuple[datetime, datetime]:
    tz = parse_timezone(timezone_name)
    start = datetime.combine(local_date, datetime.min.time(), tzinfo=tz)
    return start, start + timedelta(days=1)


def empty_hour_buckets() -> list[dict[str, float | int | None]]:
    return [{"hour": hour, "value": None, "min": None, "max": None} for hour in range(24)]


def add_hourly_sum(
    buckets: list[dict[str, float | int | None]],
    hour: int,
    value: float,
) -> None:
    if hour < 0 or hour > 23:
        return
    slot = buckets[hour]
    current = slot["value"]
    slot["value"] = value if current is None else float(current) + value


def split_interval_into_hours(
    start_at: datetime,
    end_at: datetime,
    value: float,
    timezone_name: str,
    local_date: date,
) -> list[tuple[int, float]]:
    start = aware(start_at, timezone_name)
    end = aware(end_at, timezone_name)
    if end <= start:
        if start.date() == local_date:
            return [(start.hour, value)]
        return []
    total = (end - start).total_seconds()
    if total <= 0:
        return [(start.hour, value)] if start.date() == local_date else []
    hour = start.replace(minute=0, second=0, microsecond=0)
    shares: list[tuple[int, float]] = []
    while hour < end:
        nxt = hour + timedelta(hours=1)
        overlap_start = max(start, hour)
        overlap_end = min(end, nxt)
        if overlap_end > overlap_start and overlap_start.date() == local_date:
            shares.append((overlap_start.hour, value * ((overlap_end - overlap_start).total_seconds() / total)))
        hour = nxt
    return shares


def bucket_cumulative(
    samples: list[tuple[datetime, datetime, float]],
    timezone_name: str,
    local_date: date,
) -> list[dict[str, float | int | None]]:
    """Hourly buckets for cumulative quantities with Apple-style overlap dedupe.

    Overlapping samples contribute the max rate (not sum of rates); the resulting
    timeline is attributed into local hours.
    """
    buckets = empty_hour_buckets()
    any_hit = False
    for start, end, rate in max_rate_segments(cumulative_rate_intervals(samples)):
        amount = rate * (end - start).total_seconds()
        for hour, share in split_interval_into_hours(start, end, amount, timezone_name, local_date):
            add_hourly_sum(buckets, hour, share)
            any_hit = True
    if any_hit:
        for slot in buckets:
            if slot["value"] is None:
                slot["value"] = 0.0
    return _plain_buckets(buckets)


def bucket_instant(
    samples: list[tuple[datetime, float]],
    timezone_name: str,
    local_date: date,
) -> list[dict[str, float | int | None]]:
    grouped: dict[int, list[float]] = {hour: [] for hour in range(24)}
    for start_at, value in samples:
        local = aware(start_at, timezone_name)
        if local.date() != local_date:
            continue
        grouped[local.hour].append(value)
    buckets = empty_hour_buckets()
    for hour, values in grouped.items():
        if not values:
            continue
        buckets[hour]["value"] = sum(values) / len(values)
        buckets[hour]["min"] = min(values)
        buckets[hour]["max"] = max(values)
    return _plain_buckets(buckets)


def _plain_buckets(buckets: list[dict[str, float | int | None]]) -> list[dict[str, float | int | None]]:
    out: list[dict[str, float | int | None]] = []
    for slot in buckets:
        out.append(
            {
                "hour": int(slot["hour"]),
                "value": None if slot["value"] is None else float(slot["value"]),
                "min": None if slot["min"] is None else float(slot["min"]),
                "max": None if slot["max"] is None else float(slot["max"]),
            }
        )
    return out


def stand_cells(
    rows: list[tuple[datetime, bool]],
    timezone_name: str,
    local_date: date,
) -> list[dict[str, Any]]:
    by_hour: dict[int, bool] = {}
    for start_at, stood in rows:
        local = aware(start_at, timezone_name)
        if local.date() != local_date:
            continue
        by_hour[local.hour] = bool(stood) or by_hour.get(local.hour, False)
    return [{"hour": hour, "stood": by_hour.get(hour)} for hour in range(24)]


def sit_streaks(cells: list[dict[str, Any]]) -> list[dict[str, int]]:
    streaks: list[dict[str, int]] = []
    start: int | None = None
    length = 0
    for hour in range(WAKE_START_HOUR, WAKE_END_HOUR):
        stood = next((cell["stood"] for cell in cells if cell["hour"] == hour), None)
        sitting = stood is False
        if sitting:
            if start is None:
                start = hour
                length = 1
            else:
                length += 1
        elif start is not None:
            if length >= 2:
                streaks.append({"start_hour": start, "hours": length})
            start = None
            length = 0
    if start is not None and length >= 2:
        streaks.append({"start_hour": start, "hours": length})
    return streaks


def sleep_night(
    samples: list[dict[str, Any]],
    local_date: date,
    timezone_name: str,
    *,
    include_segments: bool,
) -> dict[str, Any] | None:
    matched = [
        sample
        for sample in samples
        if local_date_of(sample["end_at"], sample.get("timezone") or timezone_name) == local_date
    ]
    if not matched:
        return None
    in_bed = [sample for sample in matched if sample["stage"] == SLEEP_STAGE_IN_BED]
    asleep = [sample for sample in matched if sample["stage"] in SLEEP_ASLEEP_STAGES]
    awake = [sample for sample in matched if sample["stage"] == SLEEP_STAGE_AWAKE]
    deep = [sample for sample in matched if sample["stage"] == SLEEP_STAGE_DEEP]
    rem = [sample for sample in matched if sample["stage"] == SLEEP_STAGE_REM]
    core = [sample for sample in matched if sample["stage"] == SLEEP_STAGE_CORE]
    span_source = in_bed or asleep or matched
    bedtime_dt = min(aware(sample["start_at"], timezone_name) for sample in span_source)
    wake_dt = max(aware(sample["end_at"], timezone_name) for sample in span_source)
    in_bed_minutes = _minutes(in_bed) if in_bed else None
    asleep_minutes = _minutes(asleep) if asleep else None
    span_minutes = (wake_dt - bedtime_dt).total_seconds() / 60.0
    bed_minutes = in_bed_minutes if in_bed_minutes and in_bed_minutes > 0 else span_minutes
    efficiency = None
    if asleep_minutes is not None and bed_minutes > 0:
        efficiency = min(1.0, asleep_minutes / bed_minutes)
    segments = []
    if include_segments:
        for sample in sorted(matched, key=lambda item: item["start_at"]):
            segments.append(
                {
                    "start_at": aware(sample["start_at"], timezone_name).isoformat(),
                    "end_at": aware(sample["end_at"], timezone_name).isoformat(),
                    "stage": sample["stage"],
                }
            )
    return {
        "local_date": local_date.isoformat(),
        "bedtime": bedtime_dt.isoformat(),
        "wake_at": wake_dt.isoformat(),
        "in_bed_minutes": in_bed_minutes,
        "asleep_minutes": asleep_minutes,
        "efficiency": efficiency,
        "deep_minutes": _minutes(deep) if deep else None,
        "rem_minutes": _minutes(rem) if rem else None,
        "core_minutes": _minutes(core) if core else None,
        "awake_minutes": _minutes(awake) if awake else None,
        "unspecified_minutes": _minutes(
            [sample for sample in matched if sample["stage"] == SLEEP_STAGE_UNSPECIFIED]
        )
        or None,
        "segments": segments,
    }


def bedtime_std_minutes(nights: list[dict[str, Any]], timezone_name: str) -> float | None:
    minutes: list[float] = []
    for night in nights:
        raw = night.get("bedtime")
        if not raw:
            continue
        if isinstance(raw, datetime):
            local = aware(raw, timezone_name)
        else:
            local = aware(datetime.fromisoformat(raw), timezone_name)
        value = local.hour * 60 + local.minute
        if local.hour < 12:
            value += 24 * 60
        minutes.append(float(value))
    if len(minutes) < 2:
        return None
    mean = sum(minutes) / len(minutes)
    variance = sum((item - mean) ** 2 for item in minutes) / (len(minutes) - 1)
    return variance**0.5


def weight_slope_kg_per_week(points: list[tuple[datetime, float]]) -> float | None:
    if len(points) < 2:
        return None
    ordered = sorted(points, key=lambda item: item[0])
    origin = ordered[0][0]
    xs = [(item[0] - origin).total_seconds() / 86400.0 for item in ordered]
    ys = [item[1] for item in ordered]
    if xs[-1] < 1:
        return None
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom <= 0:
        return None
    slope_per_day = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True)) / denom
    return slope_per_day * 7.0


def match_recovery_workout(
    sample_at: datetime,
    workouts: list[tuple[datetime, datetime, Any]],
) -> tuple[Any | None, bool]:
    best: tuple[float, Any] | None = None
    for start_at, end_at, payload in workouts:
        if end_at > sample_at:
            continue
        delay = (sample_at - end_at).total_seconds()
        if delay < 0 or delay > RECOVERY_MATCH_SECONDS:
            continue
        if best is None or delay < best[0]:
            best = (delay, payload)
        _ = start_at
    if best is None:
        return None, False
    return best[1], best[0] > RECOVERY_LATE_SECONDS


def split_spo2_windows(
    samples: list[tuple[datetime, float]],
    timezone_name: str,
) -> tuple[list[float], list[float]]:
    night: list[float] = []
    day: list[float] = []
    for start_at, value in samples:
        hour = aware(start_at, timezone_name).hour
        if hour in NIGHT_HOURS:
            night.append(value)
        else:
            day.append(value)
    return night, day


def cap_intervals(intervals: list[Any], cap: int = HEARTBEAT_INTERVAL_CAP) -> list[float]:
    out: list[float] = []
    for item in intervals:
        try:
            out.append(float(item))
        except (TypeError, ValueError):
            continue
        if len(out) >= cap:
            break
    return out


def _minutes(samples: list[dict[str, Any]]) -> float:
    total = 0.0
    for sample in samples:
        total += (sample["end_at"] - sample["start_at"]).total_seconds() / 60.0
    return total
