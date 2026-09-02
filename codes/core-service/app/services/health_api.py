"""Owner-scoped health sync and daily metric recompute."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models._mixins import utcnow
from app.models.health import (
    DELETION_KIND_HEARTBEAT_SERIES,
    DELETION_KIND_QUANTITY,
    DELETION_KIND_SLEEP,
    DELETION_KIND_STAND_HOUR,
    DELETION_KIND_WORKOUT,
    DELETION_KINDS,
    METRIC_ACTIVE_ENERGY,
    METRIC_BASAL_ENERGY,
    METRIC_BODY_MASS,
    METRIC_CARDIO_RECOVERY,
    METRIC_DISTANCE_CYCLING,
    METRIC_DISTANCE_WALKING_RUNNING,
    METRIC_EXERCISE_TIME,
    METRIC_FLIGHTS_CLIMBED,
    METRIC_HEART_RATE,
    METRIC_HRV_SDNN,
    METRIC_OXYGEN_SATURATION,
    METRIC_RESTING_HEART_RATE,
    METRIC_STAND_TIME,
    METRIC_STEP_COUNT,
    METRIC_VO2_MAX,
    QUANTITY_METRIC_TYPES,
    SLEEP_STAGES,
    HealthMetricsDaily,
    HealthMetricsLayout,
    HealthProfile,
    HealthSampleQuantity,
    HealthSampleSleep,
    HealthSampleStandHour,
    HealthSeriesHeartbeat,
    HealthSyncRun,
    HealthSyncState,
    HealthWorkoutRoute,
    HealthWorkoutSession,
)
from app.models.health_types import KNOWN_CARD_KEYS, normalize_activity_type, normalize_card_order
from app.models.user import User
from app.schemas.health import (
    HealthDeletionSyncIn,
    HealthHeartbeatSyncIn,
    HealthLayoutIn,
    HealthLayoutOut,
    HealthProfileIn,
    HealthProfileOut,
    HealthQuantitySyncIn,
    HealthSleepSyncIn,
    HealthStandHourSyncIn,
    HealthSyncDayStatusOut,
    HealthSyncOut,
    HealthSyncRunIn,
    HealthSyncRunOut,
    HealthSyncStatusOut,
    HealthWorkoutRouteSyncIn,
    HealthWorkoutSyncIn,
)
from app.services.health_metrics import (
    aggregate_sleep_minutes,
    last_value,
    local_date_of,
    median,
    parse_timezone,
    sum_values,
)
from app.services.health_scores import PROFILE_SEXES

BATCH_SAMPLES_MAX = 500
BATCH_SLEEP_MAX = 200
BATCH_STAND_HOUR_MAX = 200
BATCH_HEARTBEAT_MAX = 20
BATCH_WORKOUT_MAX = 50
BATCH_WORKOUT_ROUTE_MAX = 10
BATCH_WORKOUT_ROUTE_POINTS_MAX = 1800
BATCH_DELETION_MAX = 500


def _ensure_timezone(name: str) -> str:
    parse_timezone(name)
    return name


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _invalid_timezone(err: ValueError) -> None:
    if str(err) == "invalid_timezone":
        raise HTTPException(status_code=400, detail="invalid_timezone") from err
    raise err


def _date_list(dates: set[date]) -> list[str]:
    return sorted(item.isoformat() for item in dates)


def sync_quantity_samples(db: Session, user: User, payload: HealthQuantitySyncIn) -> HealthSyncOut:
    try:
        tz_name = _ensure_timezone(payload.timezone)
    except ValueError as err:
        _invalid_timezone(err)
        raise
    if len(payload.samples) > BATCH_SAMPLES_MAX:
        raise HTTPException(status_code=400, detail="batch_too_large")
    dates: set[date] = set()
    for item in payload.samples:
        if item.metric_type not in QUANTITY_METRIC_TYPES:
            raise HTTPException(status_code=400, detail="unknown_metric_type")
        start_at = _aware(item.start_at)
        end_at = _aware(item.end_at)
        dates.add(local_date_of(start_at, tz_name))
        row = _get_quantity(db, user.id, item.hk_uuid)
        if row is None:
            db.add(
                HealthSampleQuantity(
                    owner_user_id=user.id,
                    hk_uuid=item.hk_uuid,
                    metric_type=item.metric_type,
                    start_at=start_at,
                    end_at=end_at,
                    value=item.value,
                    unit=item.unit,
                    source_bundle_id=item.source_bundle_id,
                    source_name=item.source_name,
                    extra_metadata=item.metadata,
                )
            )
        else:
            row.metric_type = item.metric_type
            row.start_at = start_at
            row.end_at = end_at
            row.value = item.value
            row.unit = item.unit
            row.source_bundle_id = item.source_bundle_id
            row.source_name = item.source_name
            row.extra_metadata = item.metadata
            row.deleted_at = None
            row.updated_at = utcnow()
    db.flush()
    for local_date in dates:
        recompute_daily_metrics(db, user.id, local_date, tz_name)
    return HealthSyncOut(upserted=len(payload.samples), local_dates=_date_list(dates))


def sync_sleep_samples(db: Session, user: User, payload: HealthSleepSyncIn) -> HealthSyncOut:
    try:
        tz_name = _ensure_timezone(payload.timezone)
    except ValueError as err:
        _invalid_timezone(err)
        raise
    if len(payload.samples) > BATCH_SLEEP_MAX:
        raise HTTPException(status_code=400, detail="batch_too_large")
    dates: set[date] = set()
    for item in payload.samples:
        if item.stage not in SLEEP_STAGES:
            raise HTTPException(status_code=400, detail="unknown_sleep_stage")
        start_at = _aware(item.start_at)
        end_at = _aware(item.end_at)
        sample_tz = item.timezone or tz_name
        try:
            parse_timezone(sample_tz)
        except ValueError as err:
            _invalid_timezone(err)
        dates.add(local_date_of(end_at, sample_tz))
        row = _get_sleep(db, user.id, item.hk_uuid)
        if row is None:
            db.add(
                HealthSampleSleep(
                    owner_user_id=user.id,
                    hk_uuid=item.hk_uuid,
                    start_at=start_at,
                    end_at=end_at,
                    stage=item.stage,
                    timezone=sample_tz,
                    source_bundle_id=item.source_bundle_id,
                    source_name=item.source_name,
                )
            )
        else:
            row.start_at = start_at
            row.end_at = end_at
            row.stage = item.stage
            row.timezone = sample_tz
            row.source_bundle_id = item.source_bundle_id
            row.source_name = item.source_name
            row.deleted_at = None
            row.updated_at = utcnow()
    db.flush()
    for local_date in dates:
        recompute_daily_metrics(db, user.id, local_date, tz_name)
    return HealthSyncOut(upserted=len(payload.samples), local_dates=_date_list(dates))


def sync_stand_hours(db: Session, user: User, payload: HealthStandHourSyncIn) -> HealthSyncOut:
    try:
        tz_name = _ensure_timezone(payload.timezone)
    except ValueError as err:
        _invalid_timezone(err)
        raise
    if len(payload.samples) > BATCH_STAND_HOUR_MAX:
        raise HTTPException(status_code=400, detail="batch_too_large")
    dates: set[date] = set()
    for item in payload.samples:
        start_at = _aware(item.start_at)
        end_at = _aware(item.end_at)
        dates.add(local_date_of(start_at, tz_name))
        row = _get_stand_hour(db, user.id, item.hk_uuid)
        if row is None:
            db.add(
                HealthSampleStandHour(
                    owner_user_id=user.id,
                    hk_uuid=item.hk_uuid,
                    start_at=start_at,
                    end_at=end_at,
                    stood=item.stood,
                    source_bundle_id=item.source_bundle_id,
                    source_name=item.source_name,
                )
            )
        else:
            row.start_at = start_at
            row.end_at = end_at
            row.stood = item.stood
            row.source_bundle_id = item.source_bundle_id
            row.source_name = item.source_name
            row.deleted_at = None
            row.updated_at = utcnow()
    db.flush()
    for local_date in dates:
        recompute_daily_metrics(db, user.id, local_date, tz_name)
    return HealthSyncOut(upserted=len(payload.samples), local_dates=_date_list(dates))


def sync_heartbeat_series(db: Session, user: User, payload: HealthHeartbeatSyncIn) -> HealthSyncOut:
    try:
        tz_name = _ensure_timezone(payload.timezone)
    except ValueError as err:
        _invalid_timezone(err)
        raise
    if len(payload.series) > BATCH_HEARTBEAT_MAX:
        raise HTTPException(status_code=400, detail="batch_too_large")
    dates: set[date] = set()
    for item in payload.series:
        start_at = _aware(item.start_at)
        end_at = _aware(item.end_at)
        dates.add(local_date_of(start_at, tz_name))
        intervals = [interval.model_dump() for interval in item.intervals]
        row = _get_heartbeat(db, user.id, item.hk_uuid)
        if row is None:
            db.add(
                HealthSeriesHeartbeat(
                    owner_user_id=user.id,
                    hk_uuid=item.hk_uuid,
                    start_at=start_at,
                    end_at=end_at,
                    interval_count=len(intervals),
                    intervals=intervals,
                    source_bundle_id=item.source_bundle_id,
                    source_name=item.source_name,
                )
            )
        else:
            row.start_at = start_at
            row.end_at = end_at
            row.interval_count = len(intervals)
            row.intervals = intervals
            row.source_bundle_id = item.source_bundle_id
            row.source_name = item.source_name
            row.deleted_at = None
            row.updated_at = utcnow()
    db.flush()
    for local_date in dates:
        recompute_daily_metrics(db, user.id, local_date, tz_name)
    return HealthSyncOut(upserted=len(payload.series), local_dates=_date_list(dates))


def sync_workouts(db: Session, user: User, payload: HealthWorkoutSyncIn) -> HealthSyncOut:
    try:
        tz_name = _ensure_timezone(payload.timezone)
    except ValueError as err:
        _invalid_timezone(err)
        raise
    if len(payload.workouts) > BATCH_WORKOUT_MAX:
        raise HTTPException(status_code=400, detail="batch_too_large")
    dates: set[date] = set()
    for item in payload.workouts:
        start_at = _aware(item.start_at)
        end_at = _aware(item.end_at)
        dates.add(local_date_of(start_at, tz_name))
        activity = normalize_activity_type(item.activity_type, item.activity_type_raw)
        row = _get_workout(db, user.id, item.hk_uuid)
        if row is None:
            db.add(
                HealthWorkoutSession(
                    owner_user_id=user.id,
                    hk_uuid=item.hk_uuid,
                    activity_type=activity,
                    activity_type_raw=item.activity_type_raw or item.activity_type,
                    start_at=start_at,
                    end_at=end_at,
                    duration_seconds=item.duration_seconds,
                    active_energy_kcal=item.active_energy_kcal,
                    distance_m=item.distance_m,
                    avg_hr_bpm=item.avg_hr_bpm,
                    max_hr_bpm=item.max_hr_bpm,
                    avg_cadence_spm=item.avg_cadence_spm,
                    avg_pace_sec_per_km=item.avg_pace_sec_per_km,
                    elevation_ascended_m=item.elevation_ascended_m,
                    elevation_descended_m=item.elevation_descended_m,
                    weather_temp_c=item.weather_temp_c,
                    weather_humidity=item.weather_humidity,
                    location_country=item.location_country,
                    location_admin=item.location_admin,
                    location_city=item.location_city,
                    source_bundle_id=item.source_bundle_id,
                    source_name=item.source_name,
                    extra_metadata=item.metadata,
                )
            )
        else:
            row.activity_type = activity
            row.activity_type_raw = item.activity_type_raw or item.activity_type
            row.start_at = start_at
            row.end_at = end_at
            row.duration_seconds = item.duration_seconds
            row.active_energy_kcal = item.active_energy_kcal
            row.distance_m = item.distance_m
            row.avg_hr_bpm = item.avg_hr_bpm
            row.max_hr_bpm = item.max_hr_bpm
            row.avg_cadence_spm = item.avg_cadence_spm
            row.avg_pace_sec_per_km = item.avg_pace_sec_per_km
            row.elevation_ascended_m = item.elevation_ascended_m
            row.elevation_descended_m = item.elevation_descended_m
            row.weather_temp_c = item.weather_temp_c
            row.weather_humidity = item.weather_humidity
            row.location_country = item.location_country
            row.location_admin = item.location_admin
            row.location_city = item.location_city
            row.source_bundle_id = item.source_bundle_id
            row.source_name = item.source_name
            row.extra_metadata = item.metadata
            row.deleted_at = None
            row.updated_at = utcnow()
    db.flush()
    for local_date in dates:
        recompute_daily_metrics(db, user.id, local_date, tz_name)
    return HealthSyncOut(upserted=len(payload.workouts), local_dates=_date_list(dates))


def sync_workout_routes(db: Session, user: User, payload: HealthWorkoutRouteSyncIn) -> HealthSyncOut:
    try:
        tz_name = _ensure_timezone(payload.timezone)
    except ValueError as err:
        _invalid_timezone(err)
        raise
    if len(payload.routes) > BATCH_WORKOUT_ROUTE_MAX:
        raise HTTPException(status_code=400, detail="batch_too_large")
    dates: set[date] = set()
    for item in payload.routes:
        if len(item.points) > BATCH_WORKOUT_ROUTE_POINTS_MAX:
            raise HTTPException(status_code=400, detail="too_many_points")
        session = _get_live_workout(db, user.id, item.hk_uuid)
        if session is None:
            raise HTTPException(status_code=400, detail="workout_not_found")
        dates.add(local_date_of(session.start_at, tz_name))
        points = [point.model_dump() for point in item.points]
        row = _get_workout_route(db, user.id, item.hk_uuid)
        if row is None:
            db.add(
                HealthWorkoutRoute(
                    owner_user_id=user.id,
                    workout_hk_uuid=item.hk_uuid,
                    points=points,
                    point_count=len(points),
                )
            )
        else:
            row.points = points
            row.point_count = len(points)
            row.deleted_at = None
            row.updated_at = utcnow()
    db.flush()
    return HealthSyncOut(upserted=len(payload.routes), local_dates=_date_list(dates))


def sync_deletions(db: Session, user: User, payload: HealthDeletionSyncIn) -> HealthSyncOut:
    try:
        tz_name = _ensure_timezone(payload.timezone)
    except ValueError as err:
        _invalid_timezone(err)
        raise
    if len(payload.deletions) > BATCH_DELETION_MAX:
        raise HTTPException(status_code=400, detail="batch_too_large")
    dates: set[date] = set()
    now = utcnow()
    for item in payload.deletions:
        if item.kind not in DELETION_KINDS:
            raise HTTPException(status_code=400, detail="unknown_deletion_kind")
        row, stamp = _load_for_delete(db, user.id, item.hk_uuid, item.kind)
        if row is None or stamp is None:
            continue
        dates.add(local_date_of(stamp, tz_name))
        row.deleted_at = now
        row.updated_at = now
        if item.kind == DELETION_KIND_WORKOUT:
            route = _get_workout_route(db, user.id, item.hk_uuid)
            if route is not None:
                route.deleted_at = now
                route.updated_at = now
    db.flush()
    for local_date in dates:
        recompute_daily_metrics(db, user.id, local_date, tz_name)
    return HealthSyncOut(upserted=len(payload.deletions), local_dates=_date_list(dates))


def list_sync_status(
    db: Session,
    user: User,
    timezone_name: str,
    start: date,
    end: date,
) -> HealthSyncStatusOut:
    try:
        tz_name = _ensure_timezone(timezone_name)
    except ValueError as err:
        _invalid_timezone(err)
        raise
    if end < start:
        raise HTTPException(status_code=400, detail="invalid_date_range")
    tz = ZoneInfo(tz_name)
    window_start = datetime.combine(start, datetime.min.time(), tzinfo=tz)
    window_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=tz)
    buckets: dict[str, HealthSyncDayStatusOut] = {}

    def add(local: date, field: str, amount: int = 1) -> None:
        if local < start or local > end or amount <= 0:
            return
        key = local.isoformat()
        day = buckets.get(key)
        if day is None:
            day = HealthSyncDayStatusOut(local_date=key)
            buckets[key] = day
        setattr(day, field, getattr(day, field) + amount)

    for row in db.scalars(
        select(HealthMetricsDaily).where(
            HealthMetricsDaily.owner_user_id == user.id,
            HealthMetricsDaily.local_date >= start,
            HealthMetricsDaily.local_date <= end,
        )
    ):
        qty = int(row.hr_count or 0)
        if qty == 0 and any(
            getattr(row, attr) is not None
            for attr in (
                "steps",
                "active_energy_kcal",
                "basal_energy_kcal",
                "exercise_minutes",
                "body_mass_kg",
                "vo2_max",
                "hrv_median_ms",
                "spo2_avg",
                "cardio_recovery_bpm",
                "resting_hr_bpm",
            )
        ):
            qty = 1
        add(row.local_date, "quantity_count", qty)
        add(row.local_date, "sleep_count", 1 if row.sleep_asleep_minutes is not None else 0)
        add(row.local_date, "stand_hour_count", int(row.stand_hours or 0))
    for row in db.scalars(
        select(HealthWorkoutSession).where(
            HealthWorkoutSession.owner_user_id == user.id,
            HealthWorkoutSession.deleted_at.is_(None),
            HealthWorkoutSession.start_at >= window_start,
            HealthWorkoutSession.start_at < window_end,
        )
    ):
        add(local_date_of(row.start_at, tz_name), "workout_count")
    for row in db.scalars(
        select(HealthSeriesHeartbeat).where(
            HealthSeriesHeartbeat.owner_user_id == user.id,
            HealthSeriesHeartbeat.deleted_at.is_(None),
            HealthSeriesHeartbeat.start_at >= window_start,
            HealthSeriesHeartbeat.start_at < window_end,
        )
    ):
        add(local_date_of(row.start_at, tz_name), "heartbeat_series_count")

    state = db.scalar(select(HealthSyncState).where(HealthSyncState.owner_user_id == user.id))
    runs = list(
        db.scalars(
            select(HealthSyncRun)
            .where(HealthSyncRun.owner_user_id == user.id)
            .order_by(HealthSyncRun.started_at.desc())
            .limit(50)
        )
    )
    return HealthSyncStatusOut(
        timezone=tz_name,
        last_synced_at=state.last_synced_at if state else None,
        days=[buckets[key] for key in sorted(buckets)],
        runs=[_sync_run_out(row) for row in runs],
    )


def record_sync_run(db: Session, user: User, payload: HealthSyncRunIn) -> HealthSyncRunOut:
    now = utcnow()
    run = HealthSyncRun(
        owner_user_id=user.id,
        source=payload.source,
        status=payload.status,
        started_at=payload.from_at or now,
        finished_at=now,
        from_at=payload.from_at,
        to_at=payload.to_at,
        quantity_count=payload.quantity_count,
        sleep_count=payload.sleep_count,
        stand_hour_count=payload.stand_hour_count,
        heartbeat_series_count=payload.heartbeat_series_count,
        workout_count=payload.workout_count,
        route_count=payload.route_count,
        upserted=payload.upserted,
        local_dates=list(payload.local_dates),
        error=payload.error,
    )
    db.add(run)
    db.flush()
    if payload.status == "success":
        state = db.scalar(select(HealthSyncState).where(HealthSyncState.owner_user_id == user.id))
        if state is None:
            state = HealthSyncState(owner_user_id=user.id)
            db.add(state)
        if state.last_synced_at is None or payload.to_at > state.last_synced_at:
            state.last_synced_at = payload.to_at
        state.last_run_id = run.id
        state.updated_at = now
        db.flush()
    return _sync_run_out(run)


def _sync_run_out(row: HealthSyncRun) -> HealthSyncRunOut:
    dates = row.local_dates if isinstance(row.local_dates, list) else []
    return HealthSyncRunOut(
        id=str(row.id),
        source=row.source,
        status=row.status,
        started_at=row.started_at,
        finished_at=row.finished_at,
        from_at=row.from_at,
        to_at=row.to_at,
        quantity_count=row.quantity_count,
        sleep_count=row.sleep_count,
        stand_hour_count=row.stand_hour_count,
        heartbeat_series_count=row.heartbeat_series_count,
        workout_count=row.workout_count,
        route_count=row.route_count,
        upserted=row.upserted,
        local_dates=[str(item) for item in dates],
        error=row.error,
    )


def get_card_order(db: Session, user: User) -> list[str]:
    row = db.scalar(
        select(HealthMetricsLayout).where(HealthMetricsLayout.owner_user_id == user.id)
    )
    if row is None or not isinstance(row.card_order, list):
        return normalize_card_order(None)
    return normalize_card_order([str(item) for item in row.card_order])


def save_card_order(db: Session, user: User, payload: HealthLayoutIn) -> HealthLayoutOut:
    known = [key for key in payload.card_order if key in KNOWN_CARD_KEYS]
    if not known:
        raise HTTPException(status_code=400, detail="invalid_card_order")
    order = normalize_card_order(payload.card_order)
    row = db.scalar(
        select(HealthMetricsLayout).where(HealthMetricsLayout.owner_user_id == user.id)
    )
    if row is None:
        db.add(HealthMetricsLayout(owner_user_id=user.id, card_order=order))
    else:
        row.card_order = order
        row.updated_at = utcnow()
    db.flush()
    return HealthLayoutOut(card_order=order)


def get_profile(db: Session, user: User) -> HealthProfileOut:
    row = db.scalar(select(HealthProfile).where(HealthProfile.owner_user_id == user.id))
    if row is None:
        return HealthProfileOut()
    return HealthProfileOut(
        sex=row.sex,
        age_years=row.age_years,
        height_cm=row.height_cm,
        max_hr_bpm=row.max_hr_bpm,
    )


def save_profile(db: Session, user: User, payload: HealthProfileIn) -> HealthProfileOut:
    if (
        "sex" in payload.model_fields_set
        and payload.sex is not None
        and payload.sex not in PROFILE_SEXES
    ):
        raise HTTPException(status_code=400, detail="invalid_sex")
    if "age_years" in payload.model_fields_set and payload.age_years is not None:
        if payload.age_years < 1 or payload.age_years > 120:
            raise HTTPException(status_code=400, detail="invalid_age")
    if "height_cm" in payload.model_fields_set and payload.height_cm is not None:
        if payload.height_cm < 50 or payload.height_cm > 250:
            raise HTTPException(status_code=400, detail="invalid_height")
    if "max_hr_bpm" in payload.model_fields_set and payload.max_hr_bpm is not None:
        if payload.max_hr_bpm < 80 or payload.max_hr_bpm > 220:
            raise HTTPException(status_code=400, detail="invalid_max_hr")
    row = db.scalar(select(HealthProfile).where(HealthProfile.owner_user_id == user.id))
    if row is None:
        row = HealthProfile(owner_user_id=user.id)
        db.add(row)
    if "sex" in payload.model_fields_set:
        row.sex = payload.sex
    if "age_years" in payload.model_fields_set:
        row.age_years = payload.age_years
    if "height_cm" in payload.model_fields_set:
        row.height_cm = payload.height_cm
    if "max_hr_bpm" in payload.model_fields_set:
        row.max_hr_bpm = payload.max_hr_bpm
    row.updated_at = utcnow()
    db.flush()
    return HealthProfileOut(
        sex=row.sex,
        age_years=row.age_years,
        height_cm=row.height_cm,
        max_hr_bpm=row.max_hr_bpm,
    )


def recompute_daily_metrics(
    db: Session, owner_user_id: uuid.UUID, local_date: date, timezone_name: str
) -> HealthMetricsDaily:
    tz = parse_timezone(timezone_name)
    window_start = datetime.combine(local_date - timedelta(days=1), datetime.min.time(), tzinfo=tz)
    window_end = datetime.combine(local_date + timedelta(days=2), datetime.min.time(), tzinfo=tz)

    quantities = list(
        db.scalars(
            select(HealthSampleQuantity).where(
                HealthSampleQuantity.owner_user_id == owner_user_id,
                HealthSampleQuantity.deleted_at.is_(None),
                HealthSampleQuantity.start_at >= window_start,
                HealthSampleQuantity.start_at < window_end,
            )
        )
    )
    by_type: dict[str, list[HealthSampleQuantity]] = defaultdict(list)
    for quantity in quantities:
        if local_date_of(quantity.start_at, timezone_name) == local_date:
            by_type[quantity.metric_type].append(quantity)

    sleep_rows = list(
        db.scalars(
            select(HealthSampleSleep).where(
                HealthSampleSleep.owner_user_id == owner_user_id,
                HealthSampleSleep.deleted_at.is_(None),
                HealthSampleSleep.end_at >= window_start,
                HealthSampleSleep.end_at < window_end,
            )
        )
    )
    sleep_payload = [
        {"stage": row.stage, "start_at": row.start_at, "end_at": row.end_at}
        for row in sleep_rows
        if local_date_of(row.end_at, row.timezone or timezone_name) == local_date
    ]
    sleep_rolled = aggregate_sleep_minutes(sleep_payload, local_date, timezone_name)

    stand_rows = list(
        db.scalars(
            select(HealthSampleStandHour).where(
                HealthSampleStandHour.owner_user_id == owner_user_id,
                HealthSampleStandHour.deleted_at.is_(None),
                HealthSampleStandHour.start_at >= window_start,
                HealthSampleStandHour.start_at < window_end,
            )
        )
    )
    stood = [
        row
        for row in stand_rows
        if row.stood and local_date_of(row.start_at, timezone_name) == local_date
    ]

    hr_values = [row.value for row in by_type.get(METRIC_HEART_RATE, [])]
    spo2_values = [row.value for row in by_type.get(METRIC_OXYGEN_SATURATION, [])]
    walking = sum_values([row.value for row in by_type.get(METRIC_DISTANCE_WALKING_RUNNING, [])])
    cycling = sum_values([row.value for row in by_type.get(METRIC_DISTANCE_CYCLING, [])])
    if walking is None and cycling is None:
        distance = None
    else:
        distance = (walking or 0) + (cycling or 0)

    row = db.scalar(
        select(HealthMetricsDaily).where(
            HealthMetricsDaily.owner_user_id == owner_user_id,
            HealthMetricsDaily.local_date == local_date,
        )
    )
    if row is None:
        row = HealthMetricsDaily(
            owner_user_id=owner_user_id,
            local_date=local_date,
            timezone=timezone_name,
        )
        db.add(row)

    row.timezone = timezone_name
    row.steps = sum_values([item.value for item in by_type.get(METRIC_STEP_COUNT, [])])
    row.distance_m = distance
    row.flights_climbed = sum_values(
        [item.value for item in by_type.get(METRIC_FLIGHTS_CLIMBED, [])]
    )
    row.exercise_minutes = sum_values([item.value for item in by_type.get(METRIC_EXERCISE_TIME, [])])
    row.stand_minutes = sum_values([item.value for item in by_type.get(METRIC_STAND_TIME, [])])
    row.stand_hours = len(stood) if stood else None
    row.basal_energy_kcal = sum_values([item.value for item in by_type.get(METRIC_BASAL_ENERGY, [])])
    row.active_energy_kcal = sum_values(
        [item.value for item in by_type.get(METRIC_ACTIVE_ENERGY, [])]
    )
    row.hr_min = min(hr_values) if hr_values else None
    row.hr_max = max(hr_values) if hr_values else None
    row.hr_avg = (sum(hr_values) / len(hr_values)) if hr_values else None
    row.hr_count = len(hr_values) if hr_values else None
    row.resting_hr_bpm = last_value(
        [(item.start_at, item.value) for item in by_type.get(METRIC_RESTING_HEART_RATE, [])]
    )
    row.hrv_median_ms = median([item.value for item in by_type.get(METRIC_HRV_SDNN, [])])
    row.spo2_min = min(spo2_values) if spo2_values else None
    row.spo2_max = max(spo2_values) if spo2_values else None
    row.spo2_avg = (sum(spo2_values) / len(spo2_values)) if spo2_values else None
    row.sleep_in_bed_minutes = sleep_rolled["sleep_in_bed_minutes"]
    row.sleep_asleep_minutes = sleep_rolled["sleep_asleep_minutes"]
    row.sleep_deep_minutes = sleep_rolled["sleep_deep_minutes"]
    row.sleep_rem_minutes = sleep_rolled["sleep_rem_minutes"]
    row.sleep_core_minutes = sleep_rolled["sleep_core_minutes"]
    row.sleep_awake_minutes = sleep_rolled["sleep_awake_minutes"]
    row.body_mass_kg = last_value(
        [(item.start_at, item.value) for item in by_type.get(METRIC_BODY_MASS, [])]
    )
    row.vo2_max = last_value([(item.start_at, item.value) for item in by_type.get(METRIC_VO2_MAX, [])])
    row.cardio_recovery_bpm = last_value(
        [(item.start_at, item.value) for item in by_type.get(METRIC_CARDIO_RECOVERY, [])]
    )
    row.updated_at = utcnow()
    db.flush()
    return row


def _get_quantity(db: Session, owner_id: uuid.UUID, hk_uuid: uuid.UUID) -> HealthSampleQuantity | None:
    return db.scalar(
        select(HealthSampleQuantity).where(
            HealthSampleQuantity.owner_user_id == owner_id,
            HealthSampleQuantity.hk_uuid == hk_uuid,
        )
    )


def _get_sleep(db: Session, owner_id: uuid.UUID, hk_uuid: uuid.UUID) -> HealthSampleSleep | None:
    return db.scalar(
        select(HealthSampleSleep).where(
            HealthSampleSleep.owner_user_id == owner_id,
            HealthSampleSleep.hk_uuid == hk_uuid,
        )
    )


def _get_stand_hour(
    db: Session, owner_id: uuid.UUID, hk_uuid: uuid.UUID
) -> HealthSampleStandHour | None:
    return db.scalar(
        select(HealthSampleStandHour).where(
            HealthSampleStandHour.owner_user_id == owner_id,
            HealthSampleStandHour.hk_uuid == hk_uuid,
        )
    )


def _get_heartbeat(
    db: Session, owner_id: uuid.UUID, hk_uuid: uuid.UUID
) -> HealthSeriesHeartbeat | None:
    return db.scalar(
        select(HealthSeriesHeartbeat).where(
            HealthSeriesHeartbeat.owner_user_id == owner_id,
            HealthSeriesHeartbeat.hk_uuid == hk_uuid,
        )
    )


def _get_workout(db: Session, owner_id: uuid.UUID, hk_uuid: uuid.UUID) -> HealthWorkoutSession | None:
    return db.scalar(
        select(HealthWorkoutSession).where(
            HealthWorkoutSession.owner_user_id == owner_id,
            HealthWorkoutSession.hk_uuid == hk_uuid,
        )
    )


def _get_live_workout(
    db: Session, owner_id: uuid.UUID, hk_uuid: uuid.UUID
) -> HealthWorkoutSession | None:
    return db.scalar(
        select(HealthWorkoutSession).where(
            HealthWorkoutSession.owner_user_id == owner_id,
            HealthWorkoutSession.hk_uuid == hk_uuid,
            HealthWorkoutSession.deleted_at.is_(None),
        )
    )


def _get_workout_route(
    db: Session, owner_id: uuid.UUID, workout_hk_uuid: uuid.UUID
) -> HealthWorkoutRoute | None:
    return db.scalar(
        select(HealthWorkoutRoute).where(
            HealthWorkoutRoute.owner_user_id == owner_id,
            HealthWorkoutRoute.workout_hk_uuid == workout_hk_uuid,
        )
    )


def _load_for_delete(
    db: Session, owner_id: uuid.UUID, hk_uuid: uuid.UUID, kind: str
) -> tuple[Any, datetime | None]:
    if kind == DELETION_KIND_QUANTITY:
        row = _get_quantity(db, owner_id, hk_uuid)
        return (row, row.start_at) if row else (None, None)
    if kind == DELETION_KIND_SLEEP:
        row = _get_sleep(db, owner_id, hk_uuid)
        return (row, row.end_at) if row else (None, None)
    if kind == DELETION_KIND_STAND_HOUR:
        row = _get_stand_hour(db, owner_id, hk_uuid)
        return (row, row.start_at) if row else (None, None)
    if kind == DELETION_KIND_HEARTBEAT_SERIES:
        row = _get_heartbeat(db, owner_id, hk_uuid)
        return (row, row.start_at) if row else (None, None)
    if kind == DELETION_KIND_WORKOUT:
        row = _get_workout(db, owner_id, hk_uuid)
        return (row, row.start_at) if row else (None, None)
    return (None, None)
