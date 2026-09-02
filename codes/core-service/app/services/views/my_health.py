"""Personal health dashboard view."""

from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.health import (
    INSIGHT_SUCCESS,
    HealthInsightDaily,
    HealthMetricsDaily,
    HealthWorkoutSession,
)
from app.models.health_types import normalize_activity_type
from app.models.user import User
from app.schemas.views.health import (
    HealthCalendarDayOut,
    HealthCurrentOut,
    HealthEnergyTargetsOut,
    HealthInsightOut,
    HealthProfileViewOut,
    HealthSeriesPointOut,
    HealthWorkoutOut,
    HealthWorkoutsPageOut,
    MyHealthViewOut,
)
from app.services.views.health_hourly import hourly_series_for_day
from app.services.health_api import get_card_order, get_profile
from app.services.health_metrics import local_date_of
from app.services.health_scores import score_current

DEFAULT_TIMEZONE = "Asia/Shanghai"
SERIES_DAYS = 30
WORKOUT_DAYS = 7
WORKOUT_PAGE_DAYS_MIN = 1
WORKOUT_PAGE_DAYS_MAX = 31
RANGE_CHOICES = frozenset({7, 30, 90})
CARRY_FORWARD_ATTRS = ("body_mass_kg", "vo2_max", "cardio_recovery_bpm")
DAILY_METRIC_ATTRS = (
    "steps",
    "distance_m",
    "flights_climbed",
    "exercise_minutes",
    "stand_minutes",
    "stand_hours",
    "basal_energy_kcal",
    "active_energy_kcal",
    "hr_min",
    "hr_avg",
    "hr_max",
    "resting_hr_bpm",
    "hrv_median_ms",
    "spo2_avg",
    "body_mass_kg",
    "vo2_max",
    "cardio_recovery_bpm",
    "sleep_in_bed_minutes",
    "sleep_asleep_minutes",
    "sleep_deep_minutes",
    "sleep_rem_minutes",
    "sleep_core_minutes",
)


def build_my_health(
    db: Session,
    user: User,
    *,
    selected_date: date | None = None,
    range_days: int | None = None,
    month: date | None = None,
) -> MyHealthViewOut:
    tz_name = DEFAULT_TIMEZONE
    today = local_date_of(datetime.now(timezone.utc), tz_name)
    if range_days is not None and range_days not in RANGE_CHOICES:
        raise ValueError("invalid_range")
    focus = selected_date or today
    if focus > today:
        raise ValueError("invalid_date")
    mode = "range" if range_days else "day"
    range_end = today if mode == "range" else focus
    range_start = range_end - timedelta(days=(range_days or SERIES_DAYS) - 1)
    month_start = month.replace(day=1) if month else focus.replace(day=1)
    month_end = date(
        month_start.year,
        month_start.month,
        monthrange(month_start.year, month_start.month)[1],
    )

    lookback_start = min(range_start, month_start, today - timedelta(days=89))
    dailies = list(
        db.scalars(
            select(HealthMetricsDaily)
            .where(
                HealthMetricsDaily.owner_user_id == user.id,
                HealthMetricsDaily.local_date >= lookback_start,
                HealthMetricsDaily.local_date <= today,
            )
            .order_by(HealthMetricsDaily.local_date)
        )
    )
    daily_by_date = {item.local_date: item for item in dailies}

    if mode == "range":
        window = [item for item in dailies if range_start <= item.local_date <= range_end]
        current, totals = _aggregate_range(window)
        series_rows = window
        insight_rows = _insights_in_range(db, user.id, range_start, range_end)
        insight = insight_rows[0] if insight_rows else None
    else:
        current = _current_from_daily(daily_by_date.get(focus))
        current = _carry_forward(current, dailies, focus)
        totals = None
        series_rows = [
            item
            for item in dailies
            if focus - timedelta(days=SERIES_DAYS - 1) <= item.local_date <= focus
        ]
        insight = _insight_for_date(db, user.id, focus)
        insight_rows = [insight] if insight else []

    workout_page = list_my_health_workouts(db, user, end_date=today, days=WORKOUT_DAYS)
    month_tz = ZoneInfo(tz_name)
    month_window_start = datetime.combine(month_start, datetime.min.time(), tzinfo=month_tz)
    month_window_end = datetime.combine(
        month_end + timedelta(days=1), datetime.min.time(), tzinfo=month_tz
    )
    workout_dates = {
        local_date_of(item.start_at, tz_name)
        for item in db.scalars(
            select(HealthWorkoutSession).where(
                HealthWorkoutSession.owner_user_id == user.id,
                HealthWorkoutSession.deleted_at.is_(None),
                HealthWorkoutSession.start_at >= month_window_start,
                HealthWorkoutSession.start_at < month_window_end,
            )
        )
    }
    insight_dates = {
        row.local_date
        for row in db.scalars(
            select(HealthInsightDaily).where(
                HealthInsightDaily.owner_user_id == user.id,
                HealthInsightDaily.local_date >= month_start,
                HealthInsightDaily.local_date <= month_end,
                HealthInsightDaily.status == INSIGHT_SUCCESS,
            )
        )
    }
    profile = get_profile(db, user)
    scores, formulas, targets = score_current(
        current,
        sex=profile.sex,
        age_years=profile.age_years,
        height_cm=profile.height_cm,
    )
    return MyHealthViewOut(
        timezone=tz_name,
        mode=mode,
        selected_date=None if mode == "range" else focus.isoformat(),
        range_days=range_days if mode == "range" else None,
        month=f"{month_start.year:04d}-{month_start.month:02d}",
        calendar_days=_calendar_days(
            month_start,
            month_end,
            daily_by_date,
            workout_dates,
            insight_dates,
        ),
        current=current,
        totals=totals,
        scores=scores,
        score_formulas=formulas,
        card_order=get_card_order(db, user),
        recent_workouts=workout_page.workouts,
        workout_start_date=workout_page.start_date,
        workout_end_date=workout_page.end_date,
        workout_has_more=workout_page.has_more,
        series=_series_from_dailies(series_rows),
        hourly=hourly_series_for_day(db, user.id, focus, tz_name) if mode == "day" else {},
        insight=_insight_out(insight),
        insights=[item for item in (_insight_out(row) for row in insight_rows) if item is not None],
        profile=HealthProfileViewOut(
            sex=profile.sex,
            age_years=profile.age_years,
            height_cm=profile.height_cm,
            max_hr_bpm=profile.max_hr_bpm,
        ),
        energy_targets=(
            HealthEnergyTargetsOut(bmr_kcal=targets[0], active_target_kcal=targets[1])
            if targets
            else None
        ),
    )


def list_my_health_workouts(
    db: Session,
    user: User,
    *,
    end_date: date | None = None,
    days: int = WORKOUT_DAYS,
) -> HealthWorkoutsPageOut:
    tz_name = DEFAULT_TIMEZONE
    today = local_date_of(datetime.now(timezone.utc), tz_name)
    end = end_date or today
    if end > today:
        raise ValueError("invalid_date")
    if days < WORKOUT_PAGE_DAYS_MIN or days > WORKOUT_PAGE_DAYS_MAX:
        raise ValueError("invalid_range")
    start = end - timedelta(days=days - 1)
    tz = ZoneInfo(tz_name)
    window_start = datetime.combine(start, datetime.min.time(), tzinfo=tz)
    window_end = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=tz)
    workouts = list(
        db.scalars(
            select(HealthWorkoutSession)
            .where(
                HealthWorkoutSession.owner_user_id == user.id,
                HealthWorkoutSession.deleted_at.is_(None),
                HealthWorkoutSession.start_at >= window_start,
                HealthWorkoutSession.start_at < window_end,
            )
            .order_by(HealthWorkoutSession.start_at.asc())
        )
    )
    older_id = db.scalar(
        select(HealthWorkoutSession.id)
        .where(
            HealthWorkoutSession.owner_user_id == user.id,
            HealthWorkoutSession.deleted_at.is_(None),
            HealthWorkoutSession.start_at < window_start,
        )
        .limit(1)
    )
    return HealthWorkoutsPageOut(
        timezone=tz_name,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        days=days,
        workouts=[workout_out(item) for item in workouts],
        has_more=older_id is not None,
    )


def _calendar_days(
    month_start: date,
    month_end: date,
    daily_by_date: dict[date, HealthMetricsDaily],
    workout_dates: set[date],
    insight_dates: set[date],
) -> list[HealthCalendarDayOut]:
    out: list[HealthCalendarDayOut] = []
    cursor = month_start
    while cursor <= month_end:
        daily = daily_by_date.get(cursor)
        out.append(
            HealthCalendarDayOut(
                local_date=cursor.isoformat(),
                has_metrics=_daily_has_metrics(daily),
                has_workout=cursor in workout_dates,
                has_insight=cursor in insight_dates,
            )
        )
        cursor += timedelta(days=1)
    return out


def _daily_has_metrics(daily: HealthMetricsDaily | None) -> bool:
    if daily is None:
        return False
    return any(getattr(daily, attr) is not None for attr in DAILY_METRIC_ATTRS)


def _current_from_daily(daily: HealthMetricsDaily | None) -> HealthCurrentOut:
    if daily is None:
        return HealthCurrentOut()
    return HealthCurrentOut(
        steps=daily.steps,
        distance_m=daily.distance_m,
        flights_climbed=daily.flights_climbed,
        exercise_minutes=daily.exercise_minutes,
        stand_hours=daily.stand_hours,
        stand_minutes=daily.stand_minutes,
        basal_energy_kcal=daily.basal_energy_kcal,
        active_energy_kcal=daily.active_energy_kcal,
        resting_hr_bpm=daily.resting_hr_bpm,
        hr_min=daily.hr_min,
        hr_avg=daily.hr_avg,
        hr_max=daily.hr_max,
        hrv_median_ms=daily.hrv_median_ms,
        spo2_avg=daily.spo2_avg,
        body_mass_kg=daily.body_mass_kg,
        vo2_max=daily.vo2_max,
        cardio_recovery_bpm=daily.cardio_recovery_bpm,
        sleep_in_bed_minutes=daily.sleep_in_bed_minutes,
        sleep_asleep_minutes=daily.sleep_asleep_minutes,
        sleep_deep_minutes=daily.sleep_deep_minutes,
        sleep_rem_minutes=daily.sleep_rem_minutes,
        sleep_core_minutes=daily.sleep_core_minutes,
    )


def _carry_forward(
    current: HealthCurrentOut, dailies: list[HealthMetricsDaily], focus: date
) -> HealthCurrentOut:
    data = current.model_dump()
    prior = [item for item in dailies if item.local_date <= focus]
    for attr in CARRY_FORWARD_ATTRS:
        if data.get(attr) is not None:
            continue
        for item in reversed(prior):
            value = getattr(item, attr)
            if value is not None:
                data[attr] = value
                break
    return HealthCurrentOut(**data)


def _aggregate_range(dailies: list[HealthMetricsDaily]) -> tuple[HealthCurrentOut, HealthCurrentOut]:
    def total(attr: str) -> float | None:
        values = [getattr(item, attr) for item in dailies if getattr(item, attr) is not None]
        if not values:
            return None
        return float(sum(values))

    def average(attr: str) -> float | None:
        values = [getattr(item, attr) for item in dailies if getattr(item, attr) is not None]
        if not values:
            return None
        return float(sum(values) / len(values))

    def last(attr: str) -> float | None:
        for item in reversed(dailies):
            value = getattr(item, attr)
            if value is not None:
                return float(value)
        return None

    current = HealthCurrentOut(
        steps=average("steps"),
        distance_m=average("distance_m"),
        flights_climbed=average("flights_climbed"),
        exercise_minutes=average("exercise_minutes"),
        stand_hours=average("stand_hours"),
        stand_minutes=average("stand_minutes"),
        basal_energy_kcal=average("basal_energy_kcal"),
        active_energy_kcal=average("active_energy_kcal"),
        resting_hr_bpm=average("resting_hr_bpm"),
        hr_min=min((item.hr_min for item in dailies if item.hr_min is not None), default=None),
        hr_avg=average("hr_avg"),
        hr_max=max((item.hr_max for item in dailies if item.hr_max is not None), default=None),
        hrv_median_ms=average("hrv_median_ms"),
        spo2_avg=average("spo2_avg"),
        body_mass_kg=last("body_mass_kg"),
        vo2_max=average("vo2_max"),
        cardio_recovery_bpm=average("cardio_recovery_bpm"),
        sleep_in_bed_minutes=average("sleep_in_bed_minutes"),
        sleep_asleep_minutes=average("sleep_asleep_minutes"),
        sleep_deep_minutes=average("sleep_deep_minutes"),
        sleep_rem_minutes=average("sleep_rem_minutes"),
        sleep_core_minutes=average("sleep_core_minutes"),
    )
    totals = HealthCurrentOut(
        steps=total("steps"),
        distance_m=total("distance_m"),
        flights_climbed=total("flights_climbed"),
        exercise_minutes=total("exercise_minutes"),
        stand_hours=total("stand_hours"),
        stand_minutes=total("stand_minutes"),
        basal_energy_kcal=total("basal_energy_kcal"),
        active_energy_kcal=total("active_energy_kcal"),
        sleep_in_bed_minutes=total("sleep_in_bed_minutes"),
        sleep_asleep_minutes=total("sleep_asleep_minutes"),
        sleep_deep_minutes=total("sleep_deep_minutes"),
        sleep_rem_minutes=total("sleep_rem_minutes"),
        sleep_core_minutes=total("sleep_core_minutes"),
    )
    return current, totals


def workout_out(item: HealthWorkoutSession) -> HealthWorkoutOut:
    return HealthWorkoutOut(
        id=str(item.id),
        hk_uuid=str(item.hk_uuid),
        activity_type=normalize_activity_type(item.activity_type, item.activity_type_raw),
        activity_type_raw=item.activity_type_raw,
        start_at=item.start_at.isoformat(),
        end_at=item.end_at.isoformat(),
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
    )


def _series_from_dailies(dailies: list[HealthMetricsDaily]) -> dict[str, list[HealthSeriesPointOut]]:
    def points(attr: str, min_attr: str | None = None, max_attr: str | None = None):
        out: list[HealthSeriesPointOut] = []
        for daily in dailies:
            out.append(
                HealthSeriesPointOut(
                    local_date=daily.local_date.isoformat(),
                    value=getattr(daily, attr),
                    min=getattr(daily, min_attr) if min_attr else None,
                    max=getattr(daily, max_attr) if max_attr else None,
                )
            )
        return out

    return {
        "steps": points("steps"),
        "active_energy_kcal": points("active_energy_kcal"),
        "basal_energy_kcal": points("basal_energy_kcal"),
        "exercise_minutes": points("exercise_minutes"),
        "stand_hours": points("stand_hours"),
        "sleep_asleep_minutes": points("sleep_asleep_minutes"),
        "resting_hr_bpm": points("resting_hr_bpm"),
        "hrv_median_ms": points("hrv_median_ms"),
        "spo2_avg": points("spo2_avg"),
        "body_mass_kg": points("body_mass_kg"),
        "vo2_max": points("vo2_max"),
        "cardio_recovery_bpm": points("cardio_recovery_bpm"),
        "heart_rate": points("hr_avg", min_attr="hr_min", max_attr="hr_max"),
    }


def _insight_out(row: HealthInsightDaily | None) -> HealthInsightOut | None:
    if row is None:
        return None
    trends = row.trends if isinstance(row.trends, list) else []
    suggestions = row.suggestions if isinstance(row.suggestions, list) else []
    return HealthInsightOut(
        local_date=row.local_date.isoformat(),
        status=row.status,
        summary=row.summary,
        trends=[str(item) for item in trends],
        suggestions=[str(item) for item in suggestions],
    )


def _insight_for_date(db: Session, user_id, local_date: date) -> HealthInsightDaily | None:
    return db.scalar(
        select(HealthInsightDaily).where(
            HealthInsightDaily.owner_user_id == user_id,
            HealthInsightDaily.local_date == local_date,
        )
    )


def _insights_in_range(
    db: Session, user_id, start: date, end: date
) -> list[HealthInsightDaily]:
    return list(
        db.scalars(
            select(HealthInsightDaily)
            .where(
                HealthInsightDaily.owner_user_id == user_id,
                HealthInsightDaily.local_date >= start,
                HealthInsightDaily.local_date <= end,
            )
            .order_by(HealthInsightDaily.local_date.desc())
        )
    )
