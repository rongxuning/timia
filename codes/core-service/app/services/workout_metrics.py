"""Pure workout metrics: running index, training load, splits, zones.

Estimates for personal training observation only — not medical advice.
"""

from __future__ import annotations

import math
from typing import Any

from app.schemas.views.health import HealthScoreFormulaOut

EARTH_RADIUS_M = 6_371_000.0
ZONE_WEIGHTS = (0.20, 0.35, 0.55, 0.75, 1.00)

# %HRR bounds: zone lo inclusive, hi exclusive except zone 5 hi=1
HRR_ZONE_BOUNDS = ((0.0, 0.50), (0.50, 0.65), (0.65, 0.80), (0.80, 0.90), (0.90, 1.0))
# %HRmax when no resting HR
HRMAX_ZONE_BOUNDS = ((0.0, 0.60), (0.60, 0.70), (0.70, 0.80), (0.80, 0.90), (0.90, 1.0))

# Pace zone speed fractions of VDOT (m/min scale)
PACE_VDOT_FRACS = (
    ("E", 0.59, 0.74),
    ("M", 0.75, 0.83),
    ("T", 0.84, 0.90),
    ("I", 0.91, 0.97),
    ("R", 0.98, 1.10),
)
# Relative pace multipliers (slower → faster): (name, slower_mult, faster_mult)
PACE_RELATIVE_BANDS = (
    ("E", 1.15, 1.08),
    ("M", 1.08, 1.03),
    ("T", 1.03, 0.97),
    ("I", 0.97, 0.92),
    ("R", 0.92, 0.85),
)

RUNNING_INDEX_FORMULA = HealthScoreFormulaOut(
    formula=(
        "RI0 = 213.9/t × (d/1000)^1.06 + 3.5；"
        "x = clamp(HR/HRmax×1.45 − 0.30, 0, 1)；"
        "跑力 = clamp(RI0/x, 20, 85)"
    ),
    hint=(
        "根据本次配速与心率估算有氧跑力；约合瓦特来自手表跑步功率或体重×速度。"
        "仅适用于跑步、时长≥12 分钟、距离≥1 km、均速≥6 km/h，且有平均心率与最大心率。"
        "不能替代实验室测试。这是估算，非医疗建议。"
    ),
)

TRAINING_LOAD_FORMULA = HealthScoreFormulaOut(
    formula=(
        "区间负荷 = Σ(分钟 × 区权重 0.20/0.35/0.55/0.75/1.00)；"
        "TRIMP = Σ Δt·HRR·0.64·e^(k·HRR)；"
        "rTSS = (t/60)·IF²·100"
    ),
    hint=(
        "宫格是区间加权；TRIMP 是 Banister 指数加权心率；"
        "rTSS 是相对阈值配速的压力分，1 小时阈值配速约为 100。"
        "需有时长与心率（rTSS 另需跑力与配速）。这是估算，非医疗建议。"
    ),
)

TRIMP_FORMULA = HealthScoreFormulaOut(
    formula=(
        "TRIMP = Σ Δt_min · HRR · 0.64 · e^(k·HRR)；"
        "k 男 1.92 / 女 1.67 / 其他 1.80；"
        "无静息心率时 HRR = HR/HRmax"
    ),
    hint=(
        "Banister 指数加权心率负荷。有心率序列则按点累加，否则用场均心率。"
        "需有时长、心率与最大心率。这是估算，非医疗建议。"
    ),
)

RTSS_FORMULA = HealthScoreFormulaOut(
    formula=(
        "阈值配速由跑力×0.88 的氧气成本反解（Daniels）；"
        "IF = 阈值配速 / 本次配速；"
        "rTSS = 时长(小时) × IF² × 100"
    ),
    hint=(
        "相对阈值配速的跑步压力分；1 小时跑在阈值配速约等于 100。"
        "需有即时跑力与配速。这是估算，非医疗建议。"
    ),
)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def tanaka_hr_max(age_years: int | None) -> float | None:
    if age_years is None:
        return None
    return 208.0 - 0.7 * age_years


def resolve_hr_max(*, profile_max: float | None, age_years: int | None) -> float | None:
    if profile_max is not None:
        return float(profile_max)
    return tanaka_hr_max(age_years)


def running_index(
    *,
    activity_type: str,
    duration_seconds: int,
    distance_m: float | None,
    avg_hr_bpm: float | None,
    hr_max: float | None,
    mean_grade: float | None = None,
) -> float | None:
    if activity_type != "running":
        return None
    if duration_seconds < 12 * 60:
        return None
    if distance_m is None or distance_m < 1000:
        return None
    if avg_hr_bpm is None or hr_max is None or hr_max <= 0:
        return None

    t_min = duration_seconds / 60.0
    if t_min <= 0:
        return None
    speed = distance_m / t_min  # m/min
    if speed < 100:
        return None

    d_eff = distance_m
    if mean_grade is not None:
        vo2 = 0.2 * speed + 0.9 * speed * mean_grade + 3.5
        v_eq = (vo2 - 3.5) / 0.2
        d_eff = v_eq * t_min

    ri0 = 213.9 / t_min * (d_eff / 1000.0) ** 1.06 + 3.5
    x = _clamp(avg_hr_bpm / hr_max * 1.45 - 0.30, 0.0, 1.0)
    if x < 0.05:
        return None
    return round(_clamp(ri0 / x, 20.0, 85.0), 1)


def estimate_power_w(
    *,
    watch_power_w: float | None,
    mass_kg: float | None,
    distance_m: float | None,
    duration_seconds: int,
) -> float | None:
    if watch_power_w is not None:
        return float(watch_power_w)
    if mass_kg is None or distance_m is None or duration_seconds <= 0:
        return None
    return round(1.06 * mass_kg * (distance_m / duration_seconds), 1)


def _intensity_fraction(hr: float, hr_max: float, hr_rest: float | None) -> float:
    if hr_rest is not None and hr_max > hr_rest:
        return (hr - hr_rest) / (hr_max - hr_rest)
    return hr / hr_max


def _zone_bounds(hr_rest: float | None) -> tuple[tuple[float, float], ...]:
    return HRR_ZONE_BOUNDS if hr_rest is not None else HRMAX_ZONE_BOUNDS


def _zone_index(frac: float, bounds: tuple[tuple[float, float], ...]) -> int:
    for i, (lo, hi) in enumerate(bounds):
        if i == len(bounds) - 1:
            if frac >= lo:
                return i
        elif lo <= frac < hi:
            return i
    return 0 if frac < bounds[0][1] else len(bounds) - 1


def _series_durations_seconds(
    series: list[tuple[float, float]],
) -> list[float]:
    """Midpoint deltas between adjacent samples; 5 s on first and last."""
    n = len(series)
    if n == 0:
        return []
    if n == 1:
        return [5.0]
    durations: list[float] = []
    for i in range(n):
        if i == 0 or i == n - 1:
            durations.append(5.0)
        else:
            t_prev = series[i - 1][0]
            t_next = series[i + 1][0]
            durations.append(max(0.0, (t_next - t_prev) / 2.0))
    return durations


def zone_training_load(
    *,
    duration_seconds: int,
    avg_hr_bpm: float | None,
    hr_max: float | None,
    hr_rest: float | None,
    hr_series: list[tuple[float, float]] | None,
) -> float | None:
    if hr_max is None or hr_max <= 0:
        return None
    bounds = _zone_bounds(hr_rest)
    load = 0.0

    if hr_series:
        durations = _series_durations_seconds(hr_series)
        for (offset, bpm), dt_s in zip(hr_series, durations, strict=True):
            _ = offset
            frac = _intensity_fraction(bpm, hr_max, hr_rest)
            zi = _zone_index(frac, bounds)
            load += (dt_s / 60.0) * ZONE_WEIGHTS[zi]
    else:
        if avg_hr_bpm is None:
            return None
        frac = _intensity_fraction(avg_hr_bpm, hr_max, hr_rest)
        zi = _zone_index(frac, bounds)
        load = (duration_seconds / 60.0) * ZONE_WEIGHTS[zi]

    return round(_clamp(load, 0.0, 200.0), 1)


def banister_trimp(
    *,
    duration_seconds: int,
    avg_hr_bpm: float | None,
    hr_max: float | None,
    hr_rest: float | None,
    sex: str | None,
    hr_series: list[tuple[float, float]] | None,
) -> float | None:
    if hr_max is None or hr_max <= 0:
        return None
    if sex == "male":
        k = 1.92
    elif sex == "female":
        k = 1.67
    else:
        k = 1.80

    total = 0.0
    if hr_series:
        durations = _series_durations_seconds(hr_series)
        for (_offset, bpm), dt_s in zip(hr_series, durations, strict=True):
            hrr = _intensity_fraction(bpm, hr_max, hr_rest)
            hrr = _clamp(hrr, 0.0, 1.0)
            total += (dt_s / 60.0) * hrr * 0.64 * math.exp(k * hrr)
    else:
        if avg_hr_bpm is None:
            return None
        hrr = _clamp(_intensity_fraction(avg_hr_bpm, hr_max, hr_rest), 0.0, 1.0)
        total = (duration_seconds / 60.0) * hrr * 0.64 * math.exp(k * hrr)

    return round(total, 1)


def running_rtss(
    *,
    running_index_value: float | None,
    duration_seconds: int,
    pace_sec_per_km: float | None,
) -> float | None:
    if running_index_value is None or pace_sec_per_km is None or pace_sec_per_km <= 0:
        return None
    if duration_seconds <= 0:
        return None

    vo2 = 0.88 * running_index_value
    # 0.000104 v^2 + 0.182258 v + (-4.60 - VO2) = 0
    a = 0.000104
    b = 0.182258
    c = -4.60 - vo2
    disc = b * b - 4 * a * c
    if disc < 0:
        return None
    sqrt_disc = math.sqrt(disc)
    v1 = (-b + sqrt_disc) / (2 * a)
    v2 = (-b - sqrt_disc) / (2 * a)
    v = max(v1, v2)
    if v <= 0:
        v = v1 if v1 > 0 else v2
    if v <= 0:
        return None

    p_t = 60_000.0 / v
    intensity = p_t / pace_sec_per_km
    t_hours = (duration_seconds / 60.0) / 60.0
    return round(t_hours * intensity * intensity * 100.0, 1)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


# Route `t` above this is a unix clock, not seconds from workout start.
_ROUTE_ABSOLUTE_T = 100_000.0
# Hold the last heart-rate sample only briefly; longer gaps are missing data.
_MAX_SAMPLE_HOLD_S = 180.0
_LAST_SAMPLE_HOLD_S = 5.0
# Step buckets longer than a workout (daily totals) are not lap cadence.
_CADENCE_MAX_INTERVAL_S = 6 * 3600.0
_CADENCE_SPM_MIN = 20.0
_CADENCE_SPM_MAX = 300.0


def normalize_route_clock(points: list[dict]) -> list[dict]:
    """Shift unix-scale route timestamps to seconds from the first point."""
    if not points:
        return points
    origin = min(float(point["t"]) for point in points)
    if origin < _ROUTE_ABSOLUTE_T:
        return points
    shifted: list[dict] = []
    for point in points:
        copied = dict(point)
        copied["t"] = float(point["t"]) - origin
        shifted.append(copied)
    return shifted


def clip_offset_duration(offset: float, duration: float) -> tuple[float, float] | None:
    """Clip a sample that starts before the workout so the overlap stays inside it."""
    if offset < 0:
        duration += offset
        offset = 0.0
    if duration <= 0:
        return None
    return offset, duration


def cadence_intervals_from_steps(
    intervals: list[tuple[float, float, float]],
) -> list[tuple[float, float, float]]:
    """Step-count intervals → (start_offset, end_offset, steps/min).

    Instantaneous samples use the gap to the next (or previous) point.
    Day-long buckets and implausible rates are dropped.
    """
    out: list[tuple[float, float, float]] = []
    count = len(intervals)
    for index, (offset, steps, duration) in enumerate(intervals):
        dt = duration
        if dt <= 0:
            if index + 1 < count:
                dt = intervals[index + 1][0] - offset
            elif index > 0:
                dt = offset - intervals[index - 1][0]
        if dt <= 0 or dt > _CADENCE_MAX_INTERVAL_S or steps < 0:
            continue
        spm = steps / (dt / 60.0)
        if spm < _CADENCE_SPM_MIN or spm > _CADENCE_SPM_MAX:
            continue
        out.append((offset, offset + dt, spm))
    return out


def cadence_from_speed_stride(
    speed: list[tuple[float, float]],
    stride: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """steps/min ≈ speed (m/s) / stride (m) × 60, using the nearest stride sample."""
    if not speed or not stride:
        return []
    stride_sorted = sorted(stride, key=lambda item: item[0])
    out: list[tuple[float, float]] = []
    index = 0
    last = len(stride_sorted) - 1
    for stamp, meters_per_sec in speed:
        if meters_per_sec <= 0.3:
            continue
        while index < last and stride_sorted[index + 1][0] <= stamp:
            index += 1
        stride_t, stride_m = stride_sorted[index]
        if abs(stride_t - stamp) > 8 or stride_m <= 0.2:
            continue
        spm = meters_per_sec / stride_m * 60.0
        if _CADENCE_SPM_MIN <= spm <= _CADENCE_SPM_MAX:
            out.append((stamp, spm))
    return out


def _avg_in_window(
    points: list[tuple[float, float]],
    t0: float,
    t1: float,
) -> float | None:
    """Time-weighted mean. Each sample holds until the next one, capped."""
    if t1 <= t0 or not points:
        return None
    ordered = sorted(points, key=lambda item: item[0])
    total = 0.0
    weight = 0.0
    last = len(ordered) - 1
    for index, (start, value) in enumerate(ordered):
        if index < last:
            end = min(ordered[index + 1][0], start + _MAX_SAMPLE_HOLD_S)
        else:
            end = start + _LAST_SAMPLE_HOLD_S
        if end <= start:
            end = start + 1e-3
        lo = max(start, t0)
        hi = min(end, t1)
        if hi <= lo:
            continue
        span = hi - lo
        total += value * span
        weight += span
    if weight <= 0:
        return None
    return total / weight


def _avg_intervals_in_window(
    intervals: list[tuple[float, float, float]],
    t0: float,
    t1: float,
) -> float | None:
    if t1 <= t0 or not intervals:
        return None
    total = 0.0
    weight = 0.0
    for start, end, value in intervals:
        lo = max(start, t0)
        hi = min(end, t1)
        if hi <= lo:
            continue
        span = hi - lo
        total += value * span
        weight += span
    if weight <= 0:
        return None
    return total / weight


def _align_times_to_metrics(
    times: list[float],
    series_list: list[list[tuple[float, float]]],
) -> list[float]:
    """Shift a distance curve onto sample offsets when the clocks don't overlap.

    Lap durations stay the same. Used when route or speed times are absolute
    and heart-rate / cadence offsets are seconds from the workout start.
    """
    if len(times) < 2:
        return times
    stamps = [stamp for series in series_list for stamp, _value in series]
    if not stamps:
        return times
    c0, c1 = times[0], times[-1]
    lo, hi = (c0, c1) if c0 <= c1 else (c1, c0)
    m0, m1 = min(stamps), max(stamps)
    if m1 >= lo and m0 <= hi:
        return times
    span_c = abs(c1 - c0)
    span_m = m1 - m0
    if span_c <= 0 or span_m <= 0:
        return times
    ratio = span_c / span_m
    if ratio < 0.5 or ratio > 2.0:
        return times
    shift = m0 - times[0]
    return [stamp + shift for stamp in times]


def _fill_empty_split_metrics(
    splits: list[dict],
    hr_points: list[tuple[float, float]],
    cadence_points: list[tuple[float, float]],
    cadence_intervals: list[tuple[float, float, float]] | None,
) -> None:
    """If every lap missed samples, retry on a 0-based elapsed clock."""

    def covers(stamps: list[float]) -> bool:
        if len(stamps) < 2:
            return False
        span = max(stamps) - min(stamps)
        elapsed = sum(float(row["duration_seconds"]) for row in splits)
        if span <= 0 or elapsed <= 0:
            return False
        ratio = elapsed / span
        return 0.5 <= ratio <= 2.0

    def fill(key: str, avg) -> None:
        if any(row[key] is not None for row in splits):
            return
        cursor = 0.0
        for row in splits:
            t0 = cursor
            t1 = cursor + float(row["duration_seconds"])
            cursor = t1
            row[key] = avg(t0, t1)

    hr_stamps = [stamp for stamp, _value in hr_points]
    if covers(hr_stamps):
        origin = min(hr_stamps)
        shifted = [(stamp - origin, value) for stamp, value in hr_points]
        fill("avg_hr_bpm", lambda t0, t1: _avg_in_window(shifted, t0, t1))

    if cadence_intervals:
        cad_stamps = [start for start, _end, _value in cadence_intervals]
        cad_stamps.extend(end for _start, end, _value in cadence_intervals)
        if covers(cad_stamps):
            origin = min(cad_stamps)
            shifted_iv = [
                (start - origin, end - origin, value) for start, end, value in cadence_intervals
            ]
            fill(
                "avg_cadence_spm",
                lambda t0, t1: _avg_intervals_in_window(shifted_iv, t0, t1),
            )
        return
    cad_stamps = [stamp for stamp, _value in cadence_points]
    if covers(cad_stamps):
        origin = min(cad_stamps)
        shifted_pts = [(stamp - origin, value) for stamp, value in cadence_points]
        fill("avg_cadence_spm", lambda t0, t1: _avg_in_window(shifted_pts, t0, t1))


def _splits_from_curve(
    times: list[float],
    cum_d: list[float],
    hr_points: list[tuple[float, float]],
    cadence_points: list[tuple[float, float]],
    *,
    target_distance_m: float | None = None,
    cadence_intervals: list[tuple[float, float, float]] | None = None,
) -> list[dict]:
    """Cut kilometre laps from a (time, cumulative-metres) curve."""
    if len(times) < 2 or len(times) != len(cum_d):
        return []
    total = cum_d[-1]
    if total <= 0:
        return []
    # Align path length to HealthKit workout distance when GPS under/over-counts.
    if (
        target_distance_m is not None
        and target_distance_m > 0
        and abs(target_distance_m - total) / total > 0.01
    ):
        scale = target_distance_m / total
        cum_d = [d * scale for d in cum_d]
        total = cum_d[-1]

    align_series = [hr_points, cadence_points]
    if cadence_intervals:
        align_series.append([(start, value) for start, _end, value in cadence_intervals])
    times = _align_times_to_metrics(times, align_series)

    def time_at_distance(target: float) -> float:
        if target <= 0:
            return times[0]
        if target >= total:
            return times[-1]
        for i in range(1, len(cum_d)):
            if cum_d[i] >= target:
                seg = cum_d[i] - cum_d[i - 1]
                frac = (target - cum_d[i - 1]) / seg if seg > 0 else 0.0
                return times[i - 1] + frac * (times[i] - times[i - 1])
        return times[-1]

    splits: list[dict[str, Any]] = []
    full_laps = int(total // 1000)
    boundaries = [0.0] + [float(k * 1000) for k in range(1, full_laps + 1)]
    if total - boundaries[-1] > 1e-6:
        boundaries.append(total)

    for lap_i in range(len(boundaries) - 1):
        d0, d1 = boundaries[lap_i], boundaries[lap_i + 1]
        t0, t1 = time_at_distance(d0), time_at_distance(d1)
        dist = d1 - d0
        duration = t1 - t0
        pace = (duration * 1000.0 / dist) if dist > 0 else None
        if cadence_intervals:
            cadence = _avg_intervals_in_window(cadence_intervals, t0, t1)
        else:
            cadence = _avg_in_window(cadence_points, t0, t1)
        splits.append(
            {
                "lap": lap_i + 1,
                "duration_seconds": duration,
                "distance_m": dist,
                "pace_sec_per_km": pace,
                "avg_hr_bpm": _avg_in_window(hr_points, t0, t1),
                "avg_cadence_spm": cadence,
            }
        )
    _fill_empty_split_metrics(splits, hr_points, cadence_points, cadence_intervals)
    return splits


def km_splits(
    points: list[dict],
    hr_points: list[tuple[float, float]],
    cadence_points: list[tuple[float, float]],
    *,
    target_distance_m: float | None = None,
    cadence_intervals: list[tuple[float, float, float]] | None = None,
) -> list[dict]:
    """Accumulate haversine distance and cut at every 1000 m; keep partial final lap."""
    if len(points) < 2:
        return []

    points = normalize_route_clock(points)
    times = [float(p["t"]) for p in points]
    cum_d = [0.0]
    for i in range(1, len(points)):
        d = haversine_m(
            points[i - 1]["lat"],
            points[i - 1]["lng"],
            points[i]["lat"],
            points[i]["lng"],
        )
        cum_d.append(cum_d[-1] + d)
    return _splits_from_curve(
        times,
        cum_d,
        hr_points,
        cadence_points,
        target_distance_m=target_distance_m,
        cadence_intervals=cadence_intervals,
    )


def km_splits_from_speed(
    samples: list[tuple[float, float, float]],
    hr_points: list[tuple[float, float]],
    cadence_points: list[tuple[float, float]],
    *,
    target_distance_m: float | None = None,
    cadence_intervals: list[tuple[float, float, float]] | None = None,
) -> list[dict]:
    """Integrate running_speed (m/s × duration) and cut kilometres; keep last partial lap.

    Instantaneous samples (duration<=0) use the gap to the next sample's offset.
    """
    usable = [(offset, speed, duration) for offset, speed, duration in samples if speed > 0]
    if not usable:
        return []

    times: list[float] = []
    cum_d: list[float] = []
    for i, (offset, speed, duration) in enumerate(usable):
        dt = duration
        if dt <= 0:
            if i + 1 < len(usable):
                dt = usable[i + 1][0] - offset
            elif i > 0:
                dt = offset - usable[i - 1][0]
            else:
                continue
        if dt <= 0:
            continue
        if not times:
            times.append(offset)
            cum_d.append(0.0)
        elif offset > times[-1]:
            times.append(offset)
            cum_d.append(cum_d[-1])
        times.append(offset + dt)
        cum_d.append(cum_d[-1] + speed * dt)
    return _splits_from_curve(
        times,
        cum_d,
        hr_points,
        cadence_points,
        target_distance_m=target_distance_m,
        cadence_intervals=cadence_intervals,
    )


def mean_grade(points: list[dict], min_horiz_m: float = 0.0) -> float | None:
    """Overall route grade as ΣΔalt / Σhoriz (fraction). Skip horiz <= 0 or < min."""
    if len(points) < 2:
        return None
    sum_dalt = 0.0
    sum_horiz = 0.0
    for i in range(1, len(points)):
        prev, cur = points[i - 1], points[i]
        if prev.get("alt") is None or cur.get("alt") is None:
            continue
        horiz = haversine_m(prev["lat"], prev["lng"], cur["lat"], cur["lng"])
        if horiz <= 0 or horiz < min_horiz_m:
            continue
        sum_dalt += float(cur["alt"]) - float(prev["alt"])
        sum_horiz += horiz
    if sum_horiz <= 0:
        return None
    return sum_dalt / sum_horiz


def downsample_series(
    points: list[tuple[float, float]],
    max_points: int = 600,
) -> list[tuple[float, float]]:
    n = len(points)
    if n <= max_points:
        return list(points)
    if max_points <= 0:
        return []
    if max_points == 1:
        return [points[0]]
    # Include first and last; sample uniformly (step > 1 so indices stay unique).
    return [points[round(j * (n - 1) / (max_points - 1))] for j in range(max_points)]


def hr_zones(
    *,
    duration_seconds: int,
    avg_hr_bpm: float | None,
    hr_max: float | None,
    hr_rest: float | None,
    hr_series: list[tuple[float, float]] | None,
) -> list[dict]:
    if hr_max is None or hr_max <= 0:
        return []
    if not hr_series and avg_hr_bpm is None:
        return []

    bounds = _zone_bounds(hr_rest)
    seconds = [0.0] * 5

    if hr_series:
        durations = _series_durations_seconds(hr_series)
        for (_offset, bpm), dt_s in zip(hr_series, durations, strict=True):
            frac = _intensity_fraction(bpm, hr_max, hr_rest)
            seconds[_zone_index(frac, bounds)] += dt_s
    else:
        assert avg_hr_bpm is not None
        frac = _intensity_fraction(avg_hr_bpm, hr_max, hr_rest)
        seconds[_zone_index(frac, bounds)] = float(duration_seconds)

    total = sum(seconds) or float(duration_seconds) or 1.0
    out: list[dict] = []
    for i, (lo, hi) in enumerate(bounds):
        out.append(
            {
                "zone": i + 1,
                "lo": lo,
                "hi": hi if i < 4 else 1.0,
                "seconds": seconds[i],
                "ratio": seconds[i] / total,
            }
        )
    return out


def _vdot_velocity_m_per_min(vdot: float) -> float | None:
    """Daniels oxygen-cost inverse: velocity (m/min) whose VO2 equals VDOT."""
    if vdot <= 0:
        return None
    # VO2 = -4.60 + 0.182258·v + 0.000104·v²  →  0.000104 v² + 0.182258 v − (4.60+VDOT)=0
    a = 0.000104
    b = 0.182258
    c = -(4.60 + vdot)
    disc = b * b - 4 * a * c
    if disc < 0:
        return None
    v = (-b + math.sqrt(disc)) / (2 * a)
    return v if v > 0 else None


def _pace_from_vdot_frac(vdot: float, frac: float) -> float:
    """Pace (sec/km) at a fraction of vVDOT (not of VDOT itself)."""
    v_max = _vdot_velocity_m_per_min(vdot)
    if v_max is None:
        return float("inf")
    v = v_max * frac
    return 60_000.0 / v if v > 0 else float("inf")


def _pace_zone_defs(
    *,
    pace_sec_per_km: float,
    running_index_value: float | None,
) -> list[tuple[str, float, float]]:
    """Return (name, lo_sec_per_km, hi_sec_per_km) with lo faster (smaller)."""
    if running_index_value is not None and running_index_value > 0:
        defs: list[tuple[str, float, float]] = []
        for name, f_lo, f_hi in PACE_VDOT_FRACS:
            # Higher frac → faster → lower sec/km → this is lo
            lo = _pace_from_vdot_frac(running_index_value, f_hi)
            hi = _pace_from_vdot_frac(running_index_value, f_lo)
            defs.append((name, lo, hi))
        return defs

    defs = []
    for name, slower, faster in PACE_RELATIVE_BANDS:
        lo = pace_sec_per_km * faster
        hi = pace_sec_per_km * slower
        defs.append((name, lo, hi))
    return defs


def _pace_zone_index(pace: float, defs: list[tuple[str, float, float]]) -> int:
    """Assign pace to a zone; extend outer zones for values outside bands."""
    # defs ordered E (slowest) → R (fastest); lo < hi in sec/km within each
    if pace > defs[0][2]:
        return 0
    if pace < defs[-1][1]:
        return len(defs) - 1
    for i, (_name, lo, hi) in enumerate(defs):
        if lo <= pace <= hi:
            return i
    # Gap between bands: nearest by center
    best_i = 0
    best_dist = float("inf")
    for i, (_name, lo, hi) in enumerate(defs):
        mid = (lo + hi) / 2.0
        dist = abs(pace - mid)
        if dist < best_dist:
            best_dist = dist
            best_i = i
    return best_i


def pace_zones(
    *,
    duration_seconds: int,
    pace_sec_per_km: float | None,
    running_index_value: float | None,
    pace_series: list[tuple[float, float]] | None,
) -> list[dict]:
    if pace_sec_per_km is None or pace_sec_per_km <= 0:
        return []

    defs = _pace_zone_defs(
        pace_sec_per_km=pace_sec_per_km,
        running_index_value=running_index_value,
    )
    seconds = [0.0] * len(defs)

    if pace_series:
        durations = _series_durations_seconds(pace_series)
        for (_offset, pace), dt_s in zip(pace_series, durations, strict=True):
            seconds[_pace_zone_index(pace, defs)] += dt_s
    else:
        seconds[_pace_zone_index(pace_sec_per_km, defs)] = float(duration_seconds)

    total = sum(seconds) or float(duration_seconds) or 1.0
    out: list[dict] = []
    for i, (name, lo, hi) in enumerate(defs):
        out.append(
            {
                "zone": name,
                "lo": lo,
                "hi": hi,
                "seconds": seconds[i],
                "ratio": seconds[i] / total,
            }
        )
    return out
