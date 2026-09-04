"""Personal health sync routes. Owner-scoped; no workspace activity log."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.health import (
    HealthClearOut,
    HealthDeletionSyncIn,
    HealthHeartbeatSyncIn,
    HealthLayoutIn,
    HealthLayoutOut,
    HealthProfileIn,
    HealthProfileOut,
    HealthQuantitySyncIn,
    HealthSleepSyncIn,
    HealthStandHourSyncIn,
    HealthSyncCheckpointIn,
    HealthSyncCheckpointOut,
    HealthSyncOut,
    HealthSyncRunIn,
    HealthSyncRunOut,
    HealthSyncStatusOut,
    HealthWorkoutRouteSyncIn,
    HealthWorkoutSyncIn,
)
from app.services.health_api import (
    advance_sync_checkpoint,
    clear_owner_health_data,
    get_profile,
    list_sync_status,
    record_sync_run,
    save_card_order,
    save_profile,
    sync_deletions,
    sync_heartbeat_series,
    sync_quantity_samples,
    sync_sleep_samples,
    sync_stand_hours,
    sync_workout_routes,
    sync_workouts,
)
from app.services.health_metrics import local_date_of

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/sync-status", response_model=HealthSyncStatusOut)
def get_sync_status(
    tz_name: str = Query(default="Asia/Shanghai", alias="timezone"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = local_date_of(datetime.now(timezone.utc), tz_name)
    start = date_from or (today - timedelta(days=90))
    end = date_to or today
    return list_sync_status(db, user, tz_name, start, end)


@router.post("/sync/runs", response_model=HealthSyncRunOut)
def post_sync_run(
    payload: HealthSyncRunIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = record_sync_run(db, user, payload)
    db.commit()
    return result


@router.post("/sync/checkpoint", response_model=HealthSyncCheckpointOut)
def post_sync_checkpoint(
    payload: HealthSyncCheckpointIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = advance_sync_checkpoint(db, user, payload)
    db.commit()
    return result


@router.delete("/data", response_model=HealthClearOut)
def delete_health_data(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Clear synced health samples for the current user. Keeps profile and card layout."""
    result = clear_owner_health_data(db, user)
    db.commit()
    return result


@router.post("/sync/samples", response_model=HealthSyncOut)
def post_sync_samples(
    payload: HealthQuantitySyncIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = sync_quantity_samples(db, user, payload)
    db.commit()
    return result


@router.post("/sync/sleep", response_model=HealthSyncOut)
def post_sync_sleep(
    payload: HealthSleepSyncIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = sync_sleep_samples(db, user, payload)
    db.commit()
    return result


@router.post("/sync/stand-hours", response_model=HealthSyncOut)
def post_sync_stand_hours(
    payload: HealthStandHourSyncIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = sync_stand_hours(db, user, payload)
    db.commit()
    return result


@router.post("/sync/heartbeat-series", response_model=HealthSyncOut)
def post_sync_heartbeat_series(
    payload: HealthHeartbeatSyncIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = sync_heartbeat_series(db, user, payload)
    db.commit()
    return result


@router.post("/sync/workouts", response_model=HealthSyncOut)
def post_sync_workouts(
    payload: HealthWorkoutSyncIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = sync_workouts(db, user, payload)
    db.commit()
    return result


@router.post("/sync/workout-routes", response_model=HealthSyncOut)
def post_sync_workout_routes(
    payload: HealthWorkoutRouteSyncIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = sync_workout_routes(db, user, payload)
    db.commit()
    return result


@router.post("/sync/deletions", response_model=HealthSyncOut)
def post_sync_deletions(
    payload: HealthDeletionSyncIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = sync_deletions(db, user, payload)
    db.commit()
    return result


@router.patch("/layout", response_model=HealthLayoutOut)
def patch_health_layout(
    payload: HealthLayoutIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = save_card_order(db, user, payload)
    db.commit()
    return result


@router.get("/profile", response_model=HealthProfileOut)
def health_profile_get(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return get_profile(db, user)


@router.patch("/profile", response_model=HealthProfileOut)
def health_profile_patch(
    payload: HealthProfileIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = save_profile(db, user, payload)
    db.commit()
    return result
