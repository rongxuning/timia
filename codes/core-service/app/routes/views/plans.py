import uuid
from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.plans import (
    PlanDetailOut,
    PlanImportedListOut,
    PlanListOut,
    PlanNotificationListOut,
    PlanSubscribedListOut,
)
from app.services.views.plans import (
    get_plan_detail,
    list_imported_plans,
    list_plan_cards,
    list_plan_notifications,
    list_subscribed_plans,
)

router = APIRouter(prefix="/views/plans", tags=["views-plans"])
notification_view_router = APIRouter(
    prefix="/views/plan-notifications", tags=["views-plans"]
)


def _raise_http(error: ValueError) -> NoReturn:
    detail = str(error)
    if detail in {"not_found", "plan_not_found"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from error
    if detail == "invalid_tab":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from error
    raise error


@router.get("", response_model=PlanListOut)
def list_plans(
    tab: str = Query("discover"),
    q: str | None = Query(None),
    visibility: str | None = Query(None),
    creator_q: str | None = Query(None),
    tag: list[str] | None = Query(None),
    period_kind: str | None = Query(None),
    usage_kind: str | None = Query(None),
    favorite: bool | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return list_plan_cards(
            db,
            user,
            tab=tab,
            q=q,
            visibility=visibility,
            creator_q=creator_q,
            tags=tag or [],
            period_kind=period_kind,
            usage_kind=usage_kind,
            favorite=favorite,
            limit=limit,
            offset=offset,
        )
    except ValueError as error:
        _raise_http(error)


@router.get("/imported", response_model=PlanImportedListOut)
def list_imported(
    q: str | None = Query(None),
    creator_q: str | None = Query(None),
    tag: list[str] | None = Query(None),
    period_kind: str | None = Query(None),
    usage_kind: str | None = Query(None),
    favorite: bool | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return list_imported_plans(
            db,
            user,
            q=q,
            creator_q=creator_q,
            tags=tag or [],
            period_kind=period_kind,
            usage_kind=usage_kind,
            favorite=favorite,
            limit=limit,
            offset=offset,
        )
    except ValueError as error:
        _raise_http(error)


@router.get("/subscribed", response_model=PlanSubscribedListOut)
def list_subscribed(
    q: str | None = Query(None),
    creator_q: str | None = Query(None),
    tag: list[str] | None = Query(None),
    period_kind: str | None = Query(None),
    usage_kind: str | None = Query(None),
    favorite: bool | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return list_subscribed_plans(
            db,
            user,
            q=q,
            creator_q=creator_q,
            tags=tag or [],
            period_kind=period_kind,
            usage_kind=usage_kind,
            favorite=favorite,
            limit=limit,
            offset=offset,
        )
    except ValueError as error:
        _raise_http(error)


@router.get("/{plan_id}", response_model=PlanDetailOut)
def plan_detail(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return get_plan_detail(db, user, plan_id)
    except ValueError as error:
        _raise_http(error)


@notification_view_router.get("", response_model=PlanNotificationListOut)
def plan_notifications(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return list_plan_notifications(db, user, limit=limit, offset=offset)
    except ValueError as error:
        _raise_http(error)
