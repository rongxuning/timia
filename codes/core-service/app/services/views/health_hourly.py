"""Day-mode hourly buckets for health overview cards."""

from __future__ import annotations

from datetime import date, timedelta

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
    METRIC_STAND_TIME,
    METRIC_STEP_COUNT,
    METRIC_VO2_MAX,
    HealthSampleQuantity,
    HealthSampleSleep,
)
from app.schemas.views.health import HealthHourBucketOut
from app.services.health_card_math import bucket_cumulative, bucket_instant, local_day_bounds
from app.services.health_metrics import SLEEP_ASLEEP_STAGES

HOURLY_CUMULATIVE = {
    "steps": METRIC_STEP_COUNT,
    "active_energy_kcal": METRIC_ACTIVE_ENERGY,
    "basal_energy_kcal": METRIC_BASAL_ENERGY,
    "exercise_minutes": METRIC_EXERCISE_TIME,
    "stand_hours": METRIC_STAND_TIME,
}
HOURLY_INSTANT = {
    "resting_hr_bpm": METRIC_HEART_RATE,
    "hrv_median_ms": METRIC_HRV_SDNN,
    "spo2_avg": METRIC_OXYGEN_SATURATION,
    "body_mass_kg": METRIC_BODY_MASS,
    "vo2_max": METRIC_VO2_MAX,
    "cardio_recovery_bpm": METRIC_CARDIO_RECOVERY,
}


def hourly_series_for_day(
    db: Session,
    owner_id,
    focus: date,
    timezone_name: str,
) -> dict[str, list[HealthHourBucketOut]]:
    start, end = local_day_bounds(focus, timezone_name)
    wide_start = start - timedelta(hours=2)
    wide_end = end + timedelta(hours=2)
    metric_types = list({*HOURLY_CUMULATIVE.values(), *HOURLY_INSTANT.values()})
    rows = list(
        db.scalars(
            select(HealthSampleQuantity)
            .where(
                HealthSampleQuantity.owner_user_id == owner_id,
                HealthSampleQuantity.deleted_at.is_(None),
                HealthSampleQuantity.metric_type.in_(metric_types),
                HealthSampleQuantity.start_at >= wide_start,
                HealthSampleQuantity.start_at < wide_end,
            )
            .order_by(HealthSampleQuantity.start_at)
        )
    )
    by_type: dict[str, list[HealthSampleQuantity]] = {}
    for row in rows:
        by_type.setdefault(row.metric_type, []).append(row)

    out: dict[str, list[HealthHourBucketOut]] = {}
    for key, metric in HOURLY_CUMULATIVE.items():
        samples = [
            (row.start_at, row.end_at, row.value) for row in by_type.get(metric, [])
        ]
        out[key] = _hour_out(bucket_cumulative(samples, timezone_name, focus))
    for key, metric in HOURLY_INSTANT.items():
        samples = [(row.start_at, row.value) for row in by_type.get(metric, [])]
        out[key] = _hour_out(bucket_instant(samples, timezone_name, focus))

    sleep_rows = list(
        db.scalars(
            select(HealthSampleSleep).where(
                HealthSampleSleep.owner_user_id == owner_id,
                HealthSampleSleep.deleted_at.is_(None),
                HealthSampleSleep.end_at >= wide_start,
                HealthSampleSleep.start_at < wide_end,
            )
        )
    )
    asleep = [
        (row.start_at, row.end_at, (row.end_at - row.start_at).total_seconds() / 60.0)
        for row in sleep_rows
        if row.stage in SLEEP_ASLEEP_STAGES and row.end_at > row.start_at
    ]
    out["sleep_asleep_minutes"] = _hour_out(bucket_cumulative(asleep, timezone_name, focus))
    return out


def _hour_out(buckets: list[dict]) -> list[HealthHourBucketOut]:
    return [HealthHourBucketOut(**item) for item in buckets]
