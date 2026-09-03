"""Assemble GET /views/me/health/workouts/{workout_id}."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health import (
    METRIC_BODY_MASS,
    METRIC_HEART_RATE,
    METRIC_RUNNING_GROUND_CONTACT,
    METRIC_RUNNING_POWER,
    METRIC_RUNNING_SPEED,
    METRIC_RUNNING_STRIDE,
    METRIC_RUNNING_VERTICAL_OSC,
    METRIC_STEP_COUNT,
    HealthMetricsDaily,
    HealthSampleQuantity,
    HealthWorkoutRoute,
    HealthWorkoutSession,
)
from app.models.health_types import normalize_activity_type
from app.models.user import User
from app.schemas.views.health import (
    HealthKmMarkerOut,
    HealthOffsetPointOut,
    HealthRouteOut,
    HealthRoutePointOut,
    HealthSeriesWindowOut,
    HealthSplitOut,
    HealthWorkoutDetailOut,
    HealthWorkoutSeriesOut,
    HealthZoneShareOut,
)
from app.services.health_api import get_profile
from app.services.health_metrics import local_date_of
from app.services.views.my_health import DEFAULT_TIMEZONE, workout_out
from app.services.workout_metrics import (
    RUNNING_INDEX_FORMULA,
    RTSS_FORMULA,
    TRAINING_LOAD_FORMULA,
    TRIMP_FORMULA,
    banister_trimp,
    downsample_series,
    estimate_power_w,
    haversine_m,
    hr_zones,
    km_splits,
    km_splits_from_speed,
    mean_grade,
    pace_zones,
    resolve_hr_max,
    running_index,
    running_rtss,
    zone_training_load,
)

WINDOW_METRIC_TYPES = (
    METRIC_HEART_RATE,
    METRIC_RUNNING_SPEED,
    METRIC_RUNNING_STRIDE,
    METRIC_RUNNING_POWER,
    METRIC_RUNNING_VERTICAL_OSC,
    METRIC_RUNNING_GROUND_CONTACT,
    METRIC_STEP_COUNT,
)
REST_LOOKBACK_DAYS = 14
SERIES_MAX_POINTS = 600


def build_workout_detail(
    db: Session, user: User, workout_id: uuid.UUID
) -> HealthWorkoutDetailOut:
    session = db.scalar(
        select(HealthWorkoutSession).where(
            HealthWorkoutSession.id == workout_id,
            HealthWorkoutSession.owner_user_id == user.id,
            HealthWorkoutSession.deleted_at.is_(None),
        )
    )
    if session is None:
        raise ValueError("not_found")

    profile = get_profile(db, user)
    hr_max_used = resolve_hr_max(profile_max=profile.max_hr_bpm, age_years=profile.age_years)
    hr_rest_used = _recent_resting_hr(db, user.id)
    mass_kg = _recent_body_mass_kg(db, user.id)

    by_type = _group_window_samples(db, user.id, session.start_at, session.end_at)
    route_points = _load_route_points(db, user.id, session.hk_uuid)

    hr_pairs = _offset_values(by_type.get(METRIC_HEART_RATE, []))
    speed_pairs = _offset_values(by_type.get(METRIC_RUNNING_SPEED, []))
    stride_pairs = _offset_values(by_type.get(METRIC_RUNNING_STRIDE, []))
    power_pairs = _offset_values(by_type.get(METRIC_RUNNING_POWER, []))
    vo_pairs = _offset_values(by_type.get(METRIC_RUNNING_VERTICAL_OSC, []))
    gct_pairs = _offset_values(by_type.get(METRIC_RUNNING_GROUND_CONTACT, []))
    step_intervals = by_type.get(METRIC_STEP_COUNT, [])

    pace_pairs = _pace_from_speed(speed_pairs) or _pace_from_route(route_points)
    cadence_pairs = _cadence_from_steps(step_intervals)
    altitude_pairs = _altitude_from_route(route_points)

    avg_hr = session.avg_hr_bpm if session.avg_hr_bpm is not None else _mean_of(hr_pairs)
    avg_cadence = (
        session.avg_cadence_spm if session.avg_cadence_spm is not None else _mean_of(cadence_pairs)
    )

    grade = mean_grade(route_points)
    activity = normalize_activity_type(session.activity_type, session.activity_type_raw)
    index = running_index(
        activity_type=activity,
        duration_seconds=session.duration_seconds,
        distance_m=session.distance_m,
        avg_hr_bpm=avg_hr,
        hr_max=hr_max_used,
        mean_grade=grade,
    )
    watch_power = _mean_of(power_pairs)
    power_w = estimate_power_w(
        watch_power_w=watch_power,
        mass_kg=mass_kg,
        distance_m=session.distance_m,
        duration_seconds=session.duration_seconds,
    )
    load = zone_training_load(
        duration_seconds=session.duration_seconds,
        avg_hr_bpm=avg_hr,
        hr_max=hr_max_used,
        hr_rest=hr_rest_used,
        hr_series=hr_pairs or None,
    )
    trimp = banister_trimp(
        duration_seconds=session.duration_seconds,
        avg_hr_bpm=avg_hr,
        hr_max=hr_max_used,
        hr_rest=hr_rest_used,
        sex=profile.sex,
        hr_series=hr_pairs or None,
    )
    pace_avg = _session_pace_sec_per_km(session)
    rtss = running_rtss(
        running_index_value=index,
        duration_seconds=session.duration_seconds,
        pace_sec_per_km=pace_avg,
    )

    climb = session.elevation_ascended_m
    descent = session.elevation_descended_m
    if climb is None or descent is None:
        route_climb, route_descent = _elevation_from_route(route_points)
        if climb is None:
            climb = route_climb
        if descent is None:
            descent = route_descent

    stride_m = _mean_of(stride_pairs)
    if stride_m is None:
        stride_m = _stride_from_cadence(
            distance_m=session.distance_m,
            cadence_spm=avg_cadence,
            duration_seconds=session.duration_seconds,
        )

    hr_zone_rows = [
        HealthZoneShareOut(**row)
        for row in hr_zones(
            duration_seconds=session.duration_seconds,
            avg_hr_bpm=avg_hr,
            hr_max=hr_max_used,
            hr_rest=hr_rest_used,
            hr_series=hr_pairs or None,
        )
    ]
    pace_zone_rows = [
        HealthZoneShareOut(**row)
        for row in pace_zones(
            duration_seconds=session.duration_seconds,
            pace_sec_per_km=pace_avg,
            running_index_value=index,
            pace_series=pace_pairs or None,
        )
    ]

    payload = workout_out(session).model_dump()
    payload["avg_hr_bpm"] = avg_hr
    payload["avg_cadence_spm"] = avg_cadence
    payload["elevation_ascended_m"] = climb
    payload["elevation_descended_m"] = descent
    return HealthWorkoutDetailOut(
        **payload,
        stride_m=stride_m,
        running_index=index,
        running_power_w=power_w,
        training_load=load,
        trimp=trimp,
        rtss=rtss,
        hr_max_used=hr_max_used,
        hr_rest_used=hr_rest_used,
        running_index_formula=RUNNING_INDEX_FORMULA if index is not None else None,
        training_load_formula=TRAINING_LOAD_FORMULA if load is not None else None,
        trimp_formula=TRIMP_FORMULA,
        rtss_formula=RTSS_FORMULA if rtss is not None else None,
        route=_route_out(route_points),
        splits=_splits_out(
            route_points,
            hr_pairs,
            cadence_pairs,
            by_type.get(METRIC_RUNNING_SPEED, []),
            session_distance_m=session.distance_m,
            session_duration_seconds=session.duration_seconds,
            session_avg_hr_bpm=avg_hr,
            session_avg_cadence_spm=avg_cadence,
        ),
        heart_rate=_series_window(hr_pairs),
        heart_rate_zones=hr_zone_rows or None,
        series=HealthWorkoutSeriesOut(
            pace=_series_window(pace_pairs),
            cadence=_series_window(cadence_pairs),
            stride=_series_window(stride_pairs),
            power=_series_window(power_pairs),
            vertical_oscillation=_series_window(vo_pairs),
            ground_contact=_series_window(gct_pairs),
            altitude=_series_window(altitude_pairs),
        ),
        pace_zones=pace_zone_rows or None,
    )


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _recent_resting_hr(db: Session, owner_id: uuid.UUID) -> float | None:
    today = local_date_of(datetime.now(timezone.utc), DEFAULT_TIMEZONE)
    start = today - timedelta(days=REST_LOOKBACK_DAYS - 1)
    row = db.scalar(
        select(HealthMetricsDaily)
        .where(
            HealthMetricsDaily.owner_user_id == owner_id,
            HealthMetricsDaily.local_date >= start,
            HealthMetricsDaily.local_date <= today,
            HealthMetricsDaily.resting_hr_bpm.is_not(None),
        )
        .order_by(HealthMetricsDaily.local_date.desc())
    )
    return None if row is None else row.resting_hr_bpm


def _recent_body_mass_kg(db: Session, owner_id: uuid.UUID) -> float | None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=REST_LOOKBACK_DAYS)
    row = db.scalar(
        select(HealthSampleQuantity)
        .where(
            HealthSampleQuantity.owner_user_id == owner_id,
            HealthSampleQuantity.deleted_at.is_(None),
            HealthSampleQuantity.metric_type == METRIC_BODY_MASS,
            HealthSampleQuantity.start_at >= cutoff,
        )
        .order_by(HealthSampleQuantity.start_at.desc())
    )
    return None if row is None else row.value


def _group_window_samples(
    db: Session,
    owner_id: uuid.UUID,
    start_at: datetime,
    end_at: datetime,
) -> dict[str, list[tuple[float, float, float]]]:
    """Group in-window samples as (offset_seconds, value, duration_seconds)."""
    start = _aware(start_at)
    end = _aware(end_at)
    rows = list(
        db.scalars(
            select(HealthSampleQuantity)
            .where(
                HealthSampleQuantity.owner_user_id == owner_id,
                HealthSampleQuantity.deleted_at.is_(None),
                HealthSampleQuantity.metric_type.in_(WINDOW_METRIC_TYPES),
                HealthSampleQuantity.start_at >= start,
                HealthSampleQuantity.start_at <= end,
            )
            .order_by(HealthSampleQuantity.start_at)
        )
    )
    grouped: dict[str, list[tuple[float, float, float]]] = {}
    for row in rows:
        row_start = _aware(row.start_at)
        offset = (row_start - start).total_seconds()
        duration = (_aware(row.end_at) - row_start).total_seconds()
        grouped.setdefault(row.metric_type, []).append((offset, float(row.value), duration))
    return grouped


def _offset_values(
    rows: list[tuple[float, float, float]],
) -> list[tuple[float, float]]:
    return [(offset, value) for offset, value, _duration in rows]


def _load_route_points(db: Session, owner_id: uuid.UUID, hk_uuid: uuid.UUID) -> list[dict[str, Any]]:
    row = db.scalar(
        select(HealthWorkoutRoute).where(
            HealthWorkoutRoute.owner_user_id == owner_id,
            HealthWorkoutRoute.workout_hk_uuid == hk_uuid,
            HealthWorkoutRoute.deleted_at.is_(None),
        )
    )
    if row is None or not row.points:
        return []
    return list(row.points)


def _pace_from_speed(pairs: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [(offset, 1000.0 / speed) for offset, speed in pairs if speed > 0]


def _pace_from_route(points: list[dict[str, Any]]) -> list[tuple[float, float]]:
    if len(points) < 2:
        return []
    out: list[tuple[float, float]] = []
    for i in range(1, len(points)):
        prev, cur = points[i - 1], points[i]
        dt = float(cur["t"]) - float(prev["t"])
        if dt <= 0:
            continue
        dist = haversine_m(prev["lat"], prev["lng"], cur["lat"], cur["lng"])
        speed = dist / dt
        if speed <= 0:
            continue
        out.append((float(cur["t"]), 1000.0 / speed))
    return out


def _cadence_from_steps(
    intervals: list[tuple[float, float, float]],
) -> list[tuple[float, float]]:
    """Convert step_count intervals to SPM: steps / (duration_seconds / 60).

    Instantaneous samples (start==end) use the gap to the next (or previous) point.
    """
    out: list[tuple[float, float]] = []
    n = len(intervals)
    for i, (offset, steps, duration) in enumerate(intervals):
        dt = duration
        if dt <= 0:
            if i + 1 < n:
                dt = intervals[i + 1][0] - offset
            elif i > 0:
                dt = offset - intervals[i - 1][0]
        if dt <= 0:
            continue
        out.append((offset, steps / (dt / 60.0)))
    return out


def _altitude_from_route(points: list[dict[str, Any]]) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for point in points:
        alt = point.get("alt")
        if alt is None:
            continue
        out.append((float(point["t"]), float(alt)))
    return out


def _mean_of(pairs: list[tuple[float, float]]) -> float | None:
    if not pairs:
        return None
    return sum(value for _offset, value in pairs) / len(pairs)


def _elevation_from_route(points: list[dict[str, Any]]) -> tuple[float | None, float | None]:
    if len(points) < 2:
        return None, None
    climb = 0.0
    descent = 0.0
    saw_alt = False
    for i in range(1, len(points)):
        prev_alt = points[i - 1].get("alt")
        cur_alt = points[i].get("alt")
        if prev_alt is None or cur_alt is None:
            continue
        saw_alt = True
        delta = float(cur_alt) - float(prev_alt)
        if delta > 0:
            climb += delta
        elif delta < 0:
            descent += -delta
    if not saw_alt:
        return None, None
    return climb, descent


def _session_pace_sec_per_km(session: HealthWorkoutSession) -> float | None:
    if session.avg_pace_sec_per_km is not None:
        return session.avg_pace_sec_per_km
    if session.distance_m and session.distance_m > 0 and session.duration_seconds > 0:
        return session.duration_seconds * 1000.0 / session.distance_m
    return None


def _stride_from_cadence(
    *,
    distance_m: float | None,
    cadence_spm: float | None,
    duration_seconds: int,
) -> float | None:
    if distance_m is None or cadence_spm is None or cadence_spm <= 0 or duration_seconds <= 0:
        return None
    minutes = duration_seconds / 60.0
    steps = cadence_spm * minutes
    if steps <= 0:
        return None
    return distance_m / steps


def _series_window(pairs: list[tuple[float, float]]) -> HealthSeriesWindowOut | None:
    if not pairs:
        return None
    down = downsample_series(pairs, SERIES_MAX_POINTS)
    if not down:
        return None
    values = [value for _offset, value in down]
    return HealthSeriesWindowOut(
        points=[HealthOffsetPointOut(offset_seconds=offset, value=value) for offset, value in down],
        avg=sum(values) / len(values),
        max=max(values),
    )


def _route_out(points: list[dict[str, Any]]) -> HealthRouteOut | None:
    if not points:
        return None
    parsed = [
        HealthRoutePointOut(
            t=float(point["t"]),
            lat=float(point["lat"]),
            lng=float(point["lng"]),
            alt=None if point.get("alt") is None else float(point["alt"]),
        )
        for point in points
    ]
    return HealthRouteOut(points=parsed, km_markers=_km_markers(points))


def _km_markers(points: list[dict[str, Any]]) -> list[HealthKmMarkerOut]:
    if len(points) < 2:
        return []
    markers: list[HealthKmMarkerOut] = []
    cum = 0.0
    next_km = 1000.0
    km = 1
    for i in range(1, len(points)):
        prev, cur = points[i - 1], points[i]
        segment = haversine_m(prev["lat"], prev["lng"], cur["lat"], cur["lng"])
        while segment > 0 and cum + segment >= next_km:
            frac = (next_km - cum) / segment
            lat = float(prev["lat"]) + frac * (float(cur["lat"]) - float(prev["lat"]))
            lng = float(prev["lng"]) + frac * (float(cur["lng"]) - float(prev["lng"]))
            markers.append(HealthKmMarkerOut(km=km, lat=lat, lng=lng))
            km += 1
            next_km += 1000.0
        cum += segment
    return markers


def _splits_out(
    points: list[dict[str, Any]],
    hr_pairs: list[tuple[float, float]],
    cadence_pairs: list[tuple[float, float]],
    speed_samples: list[tuple[float, float, float]] | None = None,
    *,
    session_distance_m: float | None = None,
    session_duration_seconds: int | None = None,
    session_avg_hr_bpm: float | None = None,
    session_avg_cadence_spm: float | None = None,
) -> list[HealthSplitOut] | None:
    # Prefer watch running_speed (calibrated distance) over GPS haversine zig-zag.
    # Fall back when speed samples exist but cannot form a distance curve (e.g. empty).
    rows: list[dict] = []
    if speed_samples:
        rows = km_splits_from_speed(
            speed_samples,
            hr_pairs,
            cadence_pairs,
            target_distance_m=session_distance_m,
        )
    if not rows and points:
        rows = km_splits(
            points,
            hr_pairs,
            cadence_pairs,
            target_distance_m=session_distance_m,
        )
    if not rows:
        return None
    splits = [
        HealthSplitOut(
            lap=int(row["lap"]),
            duration_seconds=float(row["duration_seconds"]),
            distance_m=float(row["distance_m"]),
            pace_sec_per_km=row["pace_sec_per_km"],
            avg_hr_bpm=row["avg_hr_bpm"],
            avg_cadence_spm=row["avg_cadence_spm"],
            is_total=False,
        )
        for row in rows
    ]
    sum_duration = sum(item.duration_seconds for item in splits)
    sum_distance = sum(item.distance_m for item in splits)
    total_duration = (
        float(session_duration_seconds)
        if session_duration_seconds is not None and session_duration_seconds > 0
        else sum_duration
    )
    total_distance = (
        float(session_distance_m)
        if session_distance_m is not None and session_distance_m > 0
        else sum_distance
    )
    hrs = [item.avg_hr_bpm for item in splits if item.avg_hr_bpm is not None]
    cads = [item.avg_cadence_spm for item in splits if item.avg_cadence_spm is not None]
    splits.append(
        HealthSplitOut(
            lap=0,
            duration_seconds=total_duration,
            distance_m=total_distance,
            pace_sec_per_km=(
                (total_duration * 1000.0 / total_distance) if total_distance > 0 else None
            ),
            avg_hr_bpm=(
                session_avg_hr_bpm
                if session_avg_hr_bpm is not None
                else ((sum(hrs) / len(hrs)) if hrs else None)
            ),
            avg_cadence_spm=(
                session_avg_cadence_spm
                if session_avg_cadence_spm is not None
                else ((sum(cads) / len(cads)) if cads else None)
            ),
            is_total=True,
        )
    )
    return splits
