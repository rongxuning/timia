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


def _avg_in_window(
    points: list[tuple[float, float]],
    t0: float,
    t1: float,
) -> float | None:
    vals = [v for t, v in points if t0 <= t < t1]
    if not vals:
        return None
    return sum(vals) / len(vals)


def km_splits(
    points: list[dict],
    hr_points: list[tuple[float, float]],
    cadence_points: list[tuple[float, float]],
) -> list[dict]:
    """Accumulate haversine distance and cut at every 1000 m; keep partial final lap."""
    if len(points) < 2:
        return []

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

    total = cum_d[-1]
    if total <= 0:
        return []

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
        splits.append(
            {
                "lap": lap_i + 1,
                "duration_seconds": duration,
                "distance_m": dist,
                "pace_sec_per_km": pace,
                "avg_hr_bpm": _avg_in_window(hr_points, t0, t1),
                "avg_cadence_spm": _avg_in_window(cadence_points, t0, t1),
            }
        )
    return splits


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


def _pace_from_vdot_frac(vdot: float, frac: float) -> float:
    v = vdot * frac  # m/min
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
    # Prefer contiguous assignment using midpoints between adjacent bands
    # Build cut points on pace axis (higher sec = slower)
    # E covers slowest (highest pace), R covers fastest (lowest pace)

    # Midpoint between zone i hi (slower edge of faster zone) and zone i+1...
    # Simpler: find which band contains pace; if gap/outside, nearest.
    for i, (_name, lo, hi) in enumerate(defs):
        if lo <= pace <= hi:
            return i
    # Outside or in gap: nearest by center
    best_i = 0
    best_dist = float("inf")
    for i, (_name, lo, hi) in enumerate(defs):
        mid = (lo + hi) / 2.0
        dist = abs(pace - mid)
        if dist < best_dist:
            best_dist = dist
            best_i = i
    # Also clamp: slower than E → E; faster than R → R
    if pace > defs[0][2]:
        return 0
    if pace < defs[-1][1]:
        return len(defs) - 1
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
