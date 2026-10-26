import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.identity import User
from app.schemas.notification import InboxItemOut, InboxOut, ReadAllOut
from app.services.notifications import list_inbox, mark_all_read, mark_read

router = APIRouter(prefix="/v1/inbox", tags=["inbox"])


@router.get("", response_model=InboxOut)
def get_inbox(
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list_inbox(db, user, limit)


@router.post("/read-all", response_model=ReadAllOut)
def post_read_all(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return ReadAllOut(updated=mark_all_read(db, user))


@router.post("/{delivery_id}/read", response_model=InboxItemOut)
def post_read(
    delivery_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return mark_read(db, user, delivery_id)
