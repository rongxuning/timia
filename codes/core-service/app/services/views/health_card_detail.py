"""Sample-level detail payload for one health metric card."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health import (
    METRIC_ACTIVE_ENERGY,
    METRIC_BASAL_ENERGY,
    METRIC_BODY_MASS,
    METRIC_CARDIO_RECOVERY,
    METRIC_EXERCISE_TIME,
    METRIC_HEART_RATE,
    METRIC_HRV_SDNN,
    METRIC_OXYGEN_SATURATION,
    METRIC_RESTING_HEART_RATE,
    METRIC_STAND_TIME,
    METRIC_STEP_COUNT,
    METRIC_VO2_MAX,
    HealthMetricsDaily,
    HealthSampleQuantity,
    HealthSampleSleep,
    HealthSampleStandHour,
    HealthSeriesHeartbeat,
    HealthWorkoutSession,
)
from app.models.health_types import KNOWN_CARD_KEYS, normalize_activity_type
from app.models.user import User
from app.schemas.views.health import (
    HealthCardDetailOut,
    HealthHeartbeatPreviewOut,
    HealthHourBucketOut,
    HealthHrvDayOut,
    HealthRecoveryLinkOut,
    HealthSamplePointOut,
    HealthSitStreakOut,
    HealthSleepNightOut,
    HealthSleepSegmentOut,
    HealthSpo2DayOut,
    HealthStandCellOut,
)
from app.services.health_api import get_profile
from app.services.health_card_math import (
    HEARTBEAT_INTERVAL_CAP,
    NIGHT_HOURS,
    VO2_ACTIVITY_TYPES,
    aware,
    bedtime_std_minutes,
    bucket_cumulative,
    bucket_instant,
    cap_intervals,
    local_day_bounds,
    match_recovery_workout,
    sit_streaks,
    sleep_night,
    split_spo2_windows,
    stand_cells,
    weight_slope_kg_per_week,
)
from app.services.health_metrics import local_date_of
from app.services.health_scores import _linear, _score_sleep, _score_spo2, energy_targets
from app.services.views.my_health import DEFAULT_TIMEZONE, RANGE_CHOICES, workout_out

ZONE_GAP_CAP_SECONDS = 2 * 3600
HRV_ZONE_GAP_CAP_SECONDS = ZONE_GAP_CAP_SECONDS
HRV_DAY_LOOKBACK = 9
SPO2_DAY_LOOKBACK = 9


def build_health_card_detail(
    db: Session,
    user: User,
    metric: str,
    *,
    selected_date: date | None = None,
    range_days: int | None = None,
) -> HealthCardDetailOut:
    if metric not in KNOWN_CARD_KEYS:
        raise ValueError("unknown_metric")
    tz_name = DEFAULT_TIMEZONE
    today = local_date_of(datetime.now(timezone.utc), tz_name)
    if range_days is not None and range_days not in RANGE_CHOICES:
        raise ValueError("invalid_range")
    focus = selected_date or today
    if focus > today:
        raise ValueError("invalid_date")
    mode = "range" if range_days else "day"
    range_end = today if mode == "range" else focus
    range_start = range_end - timedelta(days=(range_days or 30) - 1)
    lookback_start = min(range_start, focus - timedelta(days=89))

    builders = {
        "steps": _steps,
        "active": _active,
        "basal": _basal,
        "exercise": _exercise,
        "stand": _stand,
        "rhr": _rhr,
        "sleep": _sleep,
        "weight": _weight,
        "hrv": _hrv,
        "vo2": _vo2,
        "recovery": _recovery,
        "spo2": _spo2,
    }
    detail = HealthCardDetailOut(
        metric=metric,
        timezone=tz_name,
        mode=mode,
        focus_date=focus.isoformat(),
        range_start=range_start.isoformat() if mode == "range" else None,
        range_end=range_end.isoformat() if mode == "range" else None,
    )
    return builders[metric](db, user, detail, tz_name, focus, range_start, range_end, lookback_start)


def _steps(db, user, detail, tz_name, focus, _range_start, _range_end, _lookback_start):
    samples = _quantities(db, user.id, [METRIC_STEP_COUNT], *_wide_day(focus, tz_name))
    detail.hourly = _hour_out(
        bucket_cumulative(
            [(row.start_at, row.end_at, row.value) for row in samples], tz_name, focus
        )
    )
    daily = _daily(db, user.id, focus)
    workouts = _workouts_for_day(db, user.id, focus, tz_name, types={"walking", "running", "hiking"})
    detail.workouts = [workout_out(item) for item in workouts]
    detail.stats = {
        "distance_m": daily.distance_m if daily else None,
        "flights_climbed": daily.flights_climbed if daily else None,
        "steps": daily.steps if daily else None,
    }
    return detail


def _active(db, user, detail, tz_name, focus, _range_start, _range_end, _lookback_start):
    samples = _quantities(db, user.id, [METRIC_ACTIVE_ENERGY], *_wide_day(focus, tz_name))
    detail.hourly = _hour_out(
        bucket_cumulative(
            [(row.start_at, row.end_at, row.value) for row in samples], tz_name, focus
        )
    )
    daily = _daily(db, user.id, focus)
    workouts = _workouts_for_day(db, user.id, focus, tz_name)
    workout_kcal = sum(item.active_energy_kcal or 0.0 for item in workouts) or None
    active = daily.active_energy_kcal if daily else None
    neat = None
    if active is not None:
        neat = max(0.0, active - (workout_kcal or 0.0))
    profile = get_profile(db, user)
    weight = _latest_body_mass_kg(db, user.id, focus)
    targets = energy_targets(
        sex=profile.sex, age_years=profile.age_years, height_cm=profile.height_cm, weight_kg=weight
    )
    detail.workouts = [workout_out(item) for item in workouts]
    detail.stats = {
        "active_energy_kcal": active,
        "workout_energy_kcal": workout_kcal,
        "neat_energy_kcal": neat,
        "active_target_kcal": targets[1] if targets else None,
        "steps": daily.steps if daily else None,
        "exercise_minutes": daily.exercise_minutes if daily else None,
    }
    return detail


def _basal(db, user, detail, tz_name, focus, _range_start, _range_end, _lookback_start):
    samples = _quantities(db, user.id, [METRIC_BASAL_ENERGY], *_wide_day(focus, tz_name))
    detail.hourly = _hour_out(
        bucket_cumulative(
            [(row.start_at, row.end_at, row.value) for row in samples], tz_name, focus
        )
    )
    daily = _daily(db, user.id, focus)
    profile = get_profile(db, user)
    weight = _latest_body_mass_kg(db, user.id, focus)
    targets = energy_targets(
        sex=profile.sex, age_years=profile.age_years, height_cm=profile.height_cm, weight_kg=weight
    )
    basal = daily.basal_energy_kcal if daily else None
    active = daily.active_energy_kcal if daily else None
    total = None
    if basal is not None or active is not None:
        total = (basal or 0.0) + (active or 0.0)
    detail.stats = {
        "basal_energy_kcal": basal,
        "active_energy_kcal": active,
        "total_energy_kcal": total,
        "bmr_kcal": targets[0] if targets else None,
    }
    return detail


def _exercise(db, user, detail, tz_name, focus, range_start, range_end, _lookback_start):
    samples = _quantities(db, user.id, [METRIC_EXERCISE_TIME], *_wide_day(focus, tz_name))
    detail.hourly = _hour_out(
        bucket_cumulative(
            [(row.start_at, row.end_at, row.value) for row in samples], tz_name, focus
        )
    )
    if detail.mode == "range":
        dailies = _dailies(db, user.id, range_start, range_end)
        exercise_values = [
            item.exercise_minutes for item in dailies if item.exercise_minutes is not None
        ]
        exercise_minutes = (
            float(sum(exercise_values) / len(exercise_values)) if exercise_values else None
        )
        workouts = _workouts_for_range(db, user.id, range_start, range_end, tz_name)
        by_day: dict[date, float] = {}
        for item in workouts:
            day = local_date_of(item.start_at, tz_name)
            by_day[day] = by_day.get(day, 0.0) + item.duration_seconds / 60.0
        if dailies:
            workout_minutes = sum(by_day.get(item.local_date, 0.0) for item in dailies) / len(
                dailies
            )
        elif by_day:
            workout_minutes = sum(by_day.values()) / len(by_day)
        else:
            workout_minutes = None
    else:
        daily = _daily(db, user.id, focus)
        workouts = _workouts_for_day(db, user.id, focus, tz_name)
        exercise_minutes = daily.exercise_minutes if daily else None
        workout_minutes = (
            sum(item.duration_seconds for item in workouts) / 60.0 if workouts else None
        )
    detail.workouts = [workout_out(item) for item in workouts]
    detail.stats = {
        "exercise_minutes": exercise_minutes,
        "workout_minutes": workout_minutes,
    }
    return detail


def _stand(db, user, detail, tz_name, focus, _range_start, _range_end, _lookback_start):
    day_start, day_end = local_day_bounds(focus, tz_name)
    rows = list(
        db.scalars(
            select(HealthSampleStandHour).where(
                HealthSampleStandHour.owner_user_id == user.id,
                HealthSampleStandHour.deleted_at.is_(None),
                HealthSampleStandHour.start_at >= day_start - timedelta(hours=2),
                HealthSampleStandHour.start_at < day_end + timedelta(hours=2),
            )
        )
    )
    cells = stand_cells([(row.start_at, row.stood) for row in rows], tz_name, focus)
    streaks = sit_streaks(cells)
    minutes_rows = _quantities(db, user.id, [METRIC_STAND_TIME], *_wide_day(focus, tz_name))
    daily = _daily(db, user.id, focus)
    detail.stand_cells = [HealthStandCellOut(**cell) for cell in cells]
    detail.sit_streaks = [HealthSitStreakOut(**item) for item in streaks]
    detail.hourly = _hour_out(
        bucket_cumulative(
            [(row.start_at, row.end_at, row.value) for row in minutes_rows], tz_name, focus
        )
    )
    longest = max((item["hours"] for item in streaks), default=None)
    detail.stats = {
        "stand_hours": daily.stand_hours if daily else None,
        "stand_minutes": daily.stand_minutes if daily else None,
        "sit_streak_max": float(longest) if longest is not None else None,
    }
    return detail


def _rhr(db, user, detail, tz_name, focus, _range_start, _range_end, _lookback_start):
    rhr_rows = _quantities(db, user.id, [METRIC_RESTING_HEART_RATE], *_wide_day(focus, tz_name))
    hr_rows = _quantities(db, user.id, [METRIC_HEART_RATE], *_wide_day(focus, tz_name))
    daily = _daily(db, user.id, focus)
    detail.samples = [
        HealthSamplePointOut(at=aware(row.start_at, tz_name).isoformat(), value=row.value)
        for row in rhr_rows
        if local_date_of(row.start_at, tz_name) == focus
    ]
    detail.hourly_heart_rate = _hour_out(
        bucket_instant([(row.start_at, row.value) for row in hr_rows], tz_name, focus)
    )
    detail.stats = {
        "resting_hr_bpm": daily.resting_hr_bpm if daily else None,
        "hr_min": daily.hr_min if daily else None,
        "hr_avg": daily.hr_avg if daily else None,
        "hr_max": daily.hr_max if daily else None,
        "hr_count": float(daily.hr_count) if daily and daily.hr_count else None,
    }
    return detail


def _sleep(db, user, detail, tz_name, focus, range_start, range_end, lookback_start):
    night_start = range_start - timedelta(days=1)
    rows = list(
        db.scalars(
            select(HealthSampleSleep).where(
                HealthSampleSleep.owner_user_id == user.id,
                HealthSampleSleep.deleted_at.is_(None),
                HealthSampleSleep.end_at >= local_day_bounds(night_start, tz_name)[0],
                HealthSampleSleep.end_at < local_day_bounds(range_end + timedelta(days=1), tz_name)[0],
            ).order_by(HealthSampleSleep.start_at)
        )
    )
    payload = [
        {
            "stage": row.stage,
            "start_at": row.start_at,
            "end_at": row.end_at,
            "timezone": row.timezone,
        }
        for row in rows
    ]
    focus_night = sleep_night(payload, focus, tz_name, include_segments=True)
    nights: list[dict] = []
    cursor = range_start
    while cursor <= range_end:
        night = sleep_night(payload, cursor, tz_name, include_segments=False)
        if night:
            nights.append(night)
        cursor += timedelta(days=1)
    detail.sleep = _sleep_out(focus_night)
    list_start = range_start if detail.mode == "range" else focus - timedelta(days=13)
    detail.sleep_nights = [
        _sleep_out(item)
        for item in nights
        if item is not None and date.fromisoformat(item["local_date"]) >= list_start
    ]
    detail.bedtime_std_minutes = bedtime_std_minutes(nights, tz_name)
    if focus_night:
        detail.stats = {
            "asleep_minutes": focus_night["asleep_minutes"],
            "in_bed_minutes": focus_night["in_bed_minutes"],
            "efficiency": focus_night["efficiency"],
            "deep_minutes": focus_night["deep_minutes"],
            "rem_minutes": focus_night["rem_minutes"],
            "core_minutes": focus_night["core_minutes"],
            "awake_minutes": focus_night["awake_minutes"],
            "bedtime_std_minutes": detail.bedtime_std_minutes,
        }
    return detail


def _weight(db, user, detail, tz_name, focus, range_start, range_end, lookback_start):
    rows = _quantities(
        db,
        user.id,
        [METRIC_BODY_MASS],
        local_day_bounds(lookback_start, tz_name)[0],
        local_day_bounds(range_end + timedelta(days=1), tz_name)[0],
    )
    points = [(row.start_at, row.value) for row in rows]
    if detail.mode == "range":
        source = [
            (start_at, value)
            for start_at, value in points
            if range_start <= local_date_of(start_at, tz_name) <= range_end
        ]
    else:
        source = points
    detail.samples = [
        HealthSamplePointOut(at=aware(start_at, tz_name).isoformat(), value=value)
        for start_at, value in source
    ]
    slope = weight_slope_kg_per_week(source)
    daily = _daily(db, user.id, focus)
    detail.stats = {
        "body_mass_kg": daily.body_mass_kg if daily else (source[-1][1] if source else None),
        "weight_slope_kg_per_week": slope,
        "sample_count": float(len(source)) if source else None,
    }
    return detail


def _hrv(db, user, detail, tz_name, focus, range_start, range_end, _lookback_start):
    rows = _quantities(db, user.id, [METRIC_HRV_SDNN], *_wide_day(focus, tz_name))
    detail.samples = [
        HealthSamplePointOut(at=aware(row.start_at, tz_name).isoformat(), value=row.value)
        for row in rows
        if local_date_of(row.start_at, tz_name) == focus
    ]
    if detail.mode == "range":
        list_start, list_end = range_start, range_end
    else:
        list_start, list_end = focus - timedelta(days=HRV_DAY_LOOKBACK), focus
    window_start = local_day_bounds(list_start, tz_name)[0]
    window_end = local_day_bounds(list_end + timedelta(days=1), tz_name)[0]
    window_rows = _quantities(db, user.id, [METRIC_HRV_SDNN], window_start, window_end)
    samples_by_day: dict[date, list[tuple[datetime, float]]] = {}
    for row in window_rows:
        local = local_date_of(row.start_at, tz_name)
        if list_start <= local <= list_end:
            samples_by_day.setdefault(local, []).append((row.start_at, row.value))
    daily_by_date = {
        row.local_date: row for row in _dailies(db, user.id, list_start, list_end)
    }
    hrv_days: list[HealthHrvDayOut] = []
    cursor = list_start
    while cursor <= list_end:
        daily_row = daily_by_date.get(cursor)
        if daily_row is None or daily_row.hrv_median_ms is None:
            cursor += timedelta(days=1)
            continue
        zones = _zone_shares(samples_by_day.get(cursor, []), lambda value: _linear(value, 60))
        hrv_days.append(
            HealthHrvDayOut(
                local_date=cursor.isoformat(),
                score=_linear(daily_row.hrv_median_ms, 60),
                hrv_median_ms=daily_row.hrv_median_ms,
                resting_hr_bpm=daily_row.resting_hr_bpm,
                **zones,
            )
        )
        cursor += timedelta(days=1)
    detail.hrv_days = hrv_days
    daily = daily_by_date.get(focus) or _daily(db, user.id, focus)
    day_start, day_end = local_day_bounds(focus, tz_name)
    series = db.scalar(
        select(HealthSeriesHeartbeat)
        .where(
            HealthSeriesHeartbeat.owner_user_id == user.id,
            HealthSeriesHeartbeat.deleted_at.is_(None),
            HealthSeriesHeartbeat.start_at >= day_start,
            HealthSeriesHeartbeat.start_at < day_end,
        )
        .order_by(HealthSeriesHeartbeat.start_at.desc())
        .limit(1)
    )
    if series is not None:
        intervals = cap_intervals(list(series.intervals or []), HEARTBEAT_INTERVAL_CAP)
        detail.heartbeat = HealthHeartbeatPreviewOut(
            start_at=aware(series.start_at, tz_name).isoformat(),
            interval_count=series.interval_count,
            intervals_ms=intervals,
        )
    detail.stats = {
        "hrv_median_ms": daily.hrv_median_ms if daily else None,
        "sample_count": float(len(detail.samples)) if detail.samples else None,
        "resting_hr_bpm": daily.resting_hr_bpm if daily else None,
        "sleep_asleep_minutes": daily.sleep_asleep_minutes if daily else None,
    }
    return detail


def _zone_shares(
    points: list[tuple[datetime, float]],
    score_fn,
) -> dict[str, float | None]:
    """Attribute consecutive sample gaps to the earlier sample's score tone (gap capped)."""
    empty = {
        "high_minutes": None,
        "good_minutes": None,
        "mid_minutes": None,
        "low_minutes": None,
        "high_ratio": None,
        "good_ratio": None,
        "mid_ratio": None,
        "low_ratio": None,
    }
    if not points:
        return empty
    minutes = {"high": 0.0, "good": 0.0, "mid": 0.0, "low": 0.0}
    ordered = sorted(points, key=lambda item: item[0])
    for index in range(len(ordered) - 1):
        start_at, value = ordered[index]
        next_at, _ = ordered[index + 1]
        gap = (next_at - start_at).total_seconds()
        if gap <= 0:
            continue
        gap = min(gap, ZONE_GAP_CAP_SECONDS)
        tone = _tone_for_score(score_fn(value))
        if tone is not None:
            minutes[tone] += gap / 60.0
    total = sum(minutes.values())
    return {
        "high_minutes": minutes["high"],
        "good_minutes": minutes["good"],
        "mid_minutes": minutes["mid"],
        "low_minutes": minutes["low"],
        "high_ratio": (minutes["high"] / total) if total > 0 else 0.0,
        "good_ratio": (minutes["good"] / total) if total > 0 else 0.0,
        "mid_ratio": (minutes["mid"] / total) if total > 0 else 0.0,
        "low_ratio": (minutes["low"] / total) if total > 0 else 0.0,
    }


def _tone_for_score(score: int | None) -> str | None:
    if score is None:
        return None
    if score >= 90:
        return "high"
    if score >= 76:
        return "good"
    if score >= 60:
        return "mid"
    return "low"


def _vo2(db, user, detail, tz_name, focus, range_start, range_end, lookback_start):
    rows = _quantities(
        db,
        user.id,
        [METRIC_VO2_MAX],
        local_day_bounds(lookback_start, tz_name)[0],
        local_day_bounds(range_end + timedelta(days=1), tz_name)[0],
    )
    points = _filter_sparse(rows, tz_name, detail.mode, range_start, range_end)
    detail.samples = [
        HealthSamplePointOut(at=aware(row.start_at, tz_name).isoformat(), value=row.value)
        for row in points
    ]
    sample_dates = {local_date_of(row.start_at, tz_name) for row in points} or {focus}
    workouts = []
    for local in sorted(sample_dates):
        workouts.extend(
            _workouts_for_day(db, user.id, local, tz_name, types=VO2_ACTIVITY_TYPES)
        )
    seen: set[str] = set()
    unique = []
    for item in workouts:
        key = str(item.id)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    unique.sort(key=lambda item: item.start_at, reverse=True)
    detail.workouts = [workout_out(item) for item in unique]
    daily = _daily(db, user.id, focus)
    slope_points = [(row.start_at, row.value) for row in points]
    detail.stats = {
        "vo2_max": daily.vo2_max if daily else (points[-1].value if points else None),
        "sample_count": float(len(points)) if points else None,
        "vo2_slope_per_week": weight_slope_kg_per_week(slope_points),
    }
    return detail


def _recovery(db, user, detail, tz_name, focus, range_start, range_end, lookback_start):
    rows = _quantities(
        db,
        user.id,
        [METRIC_CARDIO_RECOVERY],
        local_day_bounds(lookback_start, tz_name)[0],
        local_day_bounds(range_end + timedelta(days=1), tz_name)[0],
    )
    points = _filter_sparse(rows, tz_name, detail.mode, range_start, range_end)
    workout_window_start = local_day_bounds(lookback_start - timedelta(days=1), tz_name)[0]
    workout_window_end = local_day_bounds(range_end + timedelta(days=1), tz_name)[0]
    workouts = list(
        db.scalars(
            select(HealthWorkoutSession).where(
                HealthWorkoutSession.owner_user_id == user.id,
                HealthWorkoutSession.deleted_at.is_(None),
                HealthWorkoutSession.end_at >= workout_window_start,
                HealthWorkoutSession.start_at < workout_window_end,
            )
        )
    )
    workout_tuples = [(item.start_at, item.end_at, item) for item in workouts]
    links: list[HealthRecoveryLinkOut] = []
    matched_workouts = []
    for row in points:
        matched, late = match_recovery_workout(row.start_at, workout_tuples)
        workout_payload = workout_out(matched) if matched is not None else None
        if matched is not None:
            matched_workouts.append(matched)
        links.append(
            HealthRecoveryLinkOut(
                at=aware(row.start_at, tz_name).isoformat(),
                value=row.value,
                workout=workout_payload,
                possibly_late=late,
            )
        )
    detail.recovery_links = links
    detail.samples = [HealthSamplePointOut(at=item.at, value=item.value) for item in links]
    seen: set[str] = set()
    unique = []
    for item in matched_workouts:
        key = str(item.id)
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    detail.workouts = [workout_out(item) for item in unique]
    daily = _daily(db, user.id, focus)
    detail.stats = {
        "cardio_recovery_bpm": daily.cardio_recovery_bpm if daily else (points[-1].value if points else None),
        "sample_count": float(len(points)) if points else None,
        "late_count": float(sum(1 for item in links if item.possibly_late)),
    }
    return detail


def _spo2(db, user, detail, tz_name, focus, range_start, range_end, _lookback_start):
    rows = _quantities(db, user.id, [METRIC_OXYGEN_SATURATION], *_wide_day(focus, tz_name))
    day_samples = [row for row in rows if local_date_of(row.start_at, tz_name) == focus]
    focus_points = [(row.start_at, row.value) for row in day_samples]
    night_vals, day_vals = split_spo2_windows(focus_points, tz_name)
    detail.samples = [
        HealthSamplePointOut(
            at=aware(row.start_at, tz_name).isoformat(),
            value=row.value,
            window="night" if aware(row.start_at, tz_name).hour in NIGHT_HOURS else "day",
        )
        for row in day_samples
    ]
    # Hourly stays 0–1 like samples/series; UI converts to % for bars / trend labels.
    detail.hourly = _hour_out(bucket_instant(focus_points, tz_name, focus))
    if detail.mode == "range":
        list_start, list_end = range_start, range_end
    else:
        list_start, list_end = focus - timedelta(days=SPO2_DAY_LOOKBACK), focus
    window_start = local_day_bounds(list_start, tz_name)[0]
    window_end = local_day_bounds(list_end + timedelta(days=1), tz_name)[0]
    window_rows = _quantities(db, user.id, [METRIC_OXYGEN_SATURATION], window_start, window_end)
    samples_by_day: dict[date, list[tuple[datetime, float]]] = {}
    for row in window_rows:
        local = local_date_of(row.start_at, tz_name)
        if list_start <= local <= list_end:
            samples_by_day.setdefault(local, []).append((row.start_at, row.value))
    daily_by_date = {
        row.local_date: row for row in _dailies(db, user.id, list_start, list_end)
    }
    spo2_days: list[HealthSpo2DayOut] = []
    cursor = list_start
    while cursor <= list_end:
        daily_row = daily_by_date.get(cursor)
        if daily_row is None or daily_row.spo2_avg is None:
            cursor += timedelta(days=1)
            continue
        day_points = samples_by_day.get(cursor, [])
        night_day, day_day = split_spo2_windows(day_points, tz_name)
        zones = _zone_shares(day_points, _score_spo2)
        spo2_days.append(
            HealthSpo2DayOut(
                local_date=cursor.isoformat(),
                score=_score_spo2(daily_row.spo2_avg),
                spo2_avg=daily_row.spo2_avg,
                spo2_min=daily_row.spo2_min,
                spo2_max=daily_row.spo2_max,
                spo2_day_avg=(sum(day_day) / len(day_day)) if day_day else None,
                spo2_night_avg=(sum(night_day) / len(night_day)) if night_day else None,
                **zones,
            )
        )
        cursor += timedelta(days=1)
    detail.spo2_days = spo2_days
    daily = daily_by_date.get(focus) or _daily(db, user.id, focus)
    detail.stats = {
        "spo2_avg": daily.spo2_avg if daily else None,
        "spo2_min": daily.spo2_min if daily else None,
        "spo2_max": daily.spo2_max if daily else None,
        "spo2_night_avg": (sum(night_vals) / len(night_vals)) if night_vals else None,
        "spo2_day_avg": (sum(day_vals) / len(day_vals)) if day_vals else None,
        "sample_count": float(len(day_samples)) if day_samples else None,
    }
    return detail


def _filter_sparse(rows, timezone_name: str, mode: str, range_start: date, range_end: date):
    if mode != "range":
        return rows
    return [
        row
        for row in rows
        if range_start <= local_date_of(row.start_at, timezone_name) <= range_end
    ]


def _quantities(
    db: Session, owner_id, types: list[str], start: datetime, end: datetime
) -> list[HealthSampleQuantity]:
    return list(
        db.scalars(
            select(HealthSampleQuantity)
            .where(
                HealthSampleQuantity.owner_user_id == owner_id,
                HealthSampleQuantity.deleted_at.is_(None),
                HealthSampleQuantity.metric_type.in_(types),
                HealthSampleQuantity.start_at >= start,
                HealthSampleQuantity.start_at < end,
            )
            .order_by(HealthSampleQuantity.start_at)
        )
    )


def _daily(db: Session, owner_id, local_date: date) -> HealthMetricsDaily | None:
    return db.scalar(
        select(HealthMetricsDaily).where(
            HealthMetricsDaily.owner_user_id == owner_id,
            HealthMetricsDaily.local_date == local_date,
        )
    )


def _dailies(
    db: Session, owner_id, start: date, end: date
) -> list[HealthMetricsDaily]:
    return list(
        db.scalars(
            select(HealthMetricsDaily)
            .where(
                HealthMetricsDaily.owner_user_id == owner_id,
                HealthMetricsDaily.local_date >= start,
                HealthMetricsDaily.local_date <= end,
            )
            .order_by(HealthMetricsDaily.local_date)
        )
    )


def _latest_body_mass_kg(db: Session, owner_id, focus: date) -> float | None:
    row = db.scalar(
        select(HealthMetricsDaily)
        .where(
            HealthMetricsDaily.owner_user_id == owner_id,
            HealthMetricsDaily.local_date <= focus,
            HealthMetricsDaily.local_date >= focus - timedelta(days=89),
            HealthMetricsDaily.body_mass_kg.is_not(None),
        )
        .order_by(HealthMetricsDaily.local_date.desc())
    )
    return None if row is None else row.body_mass_kg


def _workouts_for_day(
    db: Session,
    owner_id,
    local_date: date,
    timezone_name: str,
    types: set[str] | None = None,
) -> list[HealthWorkoutSession]:
    start, end = local_day_bounds(local_date, timezone_name)
    rows = list(
        db.scalars(
            select(HealthWorkoutSession)
            .where(
                HealthWorkoutSession.owner_user_id == owner_id,
                HealthWorkoutSession.deleted_at.is_(None),
                HealthWorkoutSession.start_at < end,
                HealthWorkoutSession.end_at > start,
            )
            .order_by(HealthWorkoutSession.start_at)
        )
    )
    if types is None:
        return rows
    return [
        row
        for row in rows
        if normalize_activity_type(row.activity_type, row.activity_type_raw) in types
    ]


def _workouts_for_range(
    db: Session,
    owner_id,
    range_start: date,
    range_end: date,
    timezone_name: str,
) -> list[HealthWorkoutSession]:
    start, _ = local_day_bounds(range_start, timezone_name)
    _, end = local_day_bounds(range_end, timezone_name)
    return list(
        db.scalars(
            select(HealthWorkoutSession)
            .where(
                HealthWorkoutSession.owner_user_id == owner_id,
                HealthWorkoutSession.deleted_at.is_(None),
                HealthWorkoutSession.start_at < end,
                HealthWorkoutSession.end_at > start,
            )
            .order_by(HealthWorkoutSession.start_at)
        )
    )


def _wide_day(local_date: date, timezone_name: str) -> tuple[datetime, datetime]:
    start, end = local_day_bounds(local_date, timezone_name)
    return start - timedelta(hours=2), end + timedelta(hours=2)


def _hour_out(buckets: list[dict]) -> list[HealthHourBucketOut]:
    return [HealthHourBucketOut(**item) for item in buckets]


def _sleep_out(night: dict | None) -> HealthSleepNightOut | None:
    if night is None:
        return None
    return HealthSleepNightOut(
        local_date=night["local_date"],
        bedtime=night["bedtime"],
        wake_at=night["wake_at"],
        in_bed_minutes=night["in_bed_minutes"],
        asleep_minutes=night["asleep_minutes"],
        efficiency=night["efficiency"],
        deep_minutes=night["deep_minutes"],
        rem_minutes=night["rem_minutes"],
        core_minutes=night["core_minutes"],
        awake_minutes=night["awake_minutes"],
        unspecified_minutes=night.get("unspecified_minutes"),
        score=_score_sleep(night.get("asleep_minutes")),
        segments=[HealthSleepSegmentOut(**item) for item in night.get("segments") or []],
    )
