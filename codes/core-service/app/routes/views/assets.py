from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.assets import MyAssetsViewOut
from app.services.views.my_assets import build_my_assets

router = APIRouter(prefix="/views/me", tags=["views-assets"])


@router.get("/assets", response_model=MyAssetsViewOut)
def my_assets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return build_my_assets(db, user)
