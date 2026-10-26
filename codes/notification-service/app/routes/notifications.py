from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import require_internal_token
from app.db.deps import get_db
from app.schemas.notification import NotificationCreate, NotificationCreatedOut
from app.services.notifications import create_notification

router = APIRouter(prefix="/v1", tags=["notifications"])


@router.post(
    "/notifications",
    response_model=NotificationCreatedOut,
    status_code=status.HTTP_201_CREATED,
)
def post_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_token),
):
    return create_notification(db, payload)
