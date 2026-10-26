from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import require_system_admin
from app.db.deps import get_db
from app.models.identity import User
from app.schemas.notification import (
    AdminNotificationCreate,
    NotificationCreatedOut,
    ScenarioOut,
    ScenarioPatch,
)
from app.services.notifications import create_admin_notification, list_scenarios, patch_scenario

router = APIRouter(prefix="/v1/admin", tags=["admin"])


@router.post(
    "/notifications",
    response_model=NotificationCreatedOut,
    status_code=status.HTTP_201_CREATED,
)
def post_admin_notification(
    payload: AdminNotificationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_system_admin),
):
    return create_admin_notification(db, user, payload)


@router.get("/scenarios", response_model=list[ScenarioOut])
def get_scenarios(
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    return list_scenarios(db)


@router.patch("/scenarios/{key}", response_model=ScenarioOut)
def update_scenario(
    key: str,
    payload: ScenarioPatch,
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    return patch_scenario(db, key, payload)
