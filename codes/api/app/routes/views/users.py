import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_system_admin
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.users import UserDirectoryViewOut, UserMembershipDetailViewOut
from app.services.views.users_directory import build_user_directory, build_user_membership_detail

router = APIRouter(prefix="/views/users", tags=["views-users"])


@router.get("/directory", response_model=UserDirectoryViewOut)
def user_directory(db: Session = Depends(get_db), _: User = Depends(require_system_admin)):
    return build_user_directory(db)


@router.get("/{user_id}/membership-detail", response_model=UserMembershipDetailViewOut)
def user_membership_detail(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    return build_user_membership_detail(db, user_id)
