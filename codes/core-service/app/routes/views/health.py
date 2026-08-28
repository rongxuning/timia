from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.health import HealthWorkoutsPageOut, MyHealthViewOut
from app.services.views.my_health import (
    RANGE_CHOICES,
    WORKOUT_DAYS,
    WORKOUT_PAGE_DAYS_MAX,
    WORKOUT_PAGE_DAYS_MIN,
    build_my_health,
    list_my_health_workouts,
)

router = APIRouter(prefix="/views/me", tags=["views-health"])


@router.get("/health", response_model=MyHealthViewOut)
def my_health(
    selected_date: date | None = Query(default=None, alias="date"),
    range_days: int | None = Query(default=None, alias="range"),
    month: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    month_date: date | None = None
    if month:
        try:
            year_s, month_s = month.split("-", 1)
            month_date = date(int(year_s), int(month_s), 1)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="invalid_month") from exc
    if range_days is not None and range_days not in RANGE_CHOICES:
        raise HTTPException(status_code=400, detail="invalid_range")
    try:
        return build_my_health(
            db,
            user,
            selected_date=selected_date,
            range_days=range_days,
            month=month_date,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail in {"invalid_range", "invalid_date", "invalid_timezone"}:
            raise HTTPException(status_code=400, detail=detail) from exc
        raise


@router.get("/health/workouts", response_model=HealthWorkoutsPageOut)
def my_health_workouts(
    end_date: date | None = Query(default=None, alias="end"),
    days: int = Query(default=WORKOUT_DAYS, ge=WORKOUT_PAGE_DAYS_MIN, le=WORKOUT_PAGE_DAYS_MAX),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return list_my_health_workouts(db, user, end_date=end_date, days=days)
    except ValueError as exc:
        detail = str(exc)
        if detail in {"invalid_range", "invalid_date"}:
            raise HTTPException(status_code=400, detail=detail) from exc
        raise
