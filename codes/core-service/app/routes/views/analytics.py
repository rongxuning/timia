from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.analytics import MyAnalyticsViewOut
from app.services.views.my_analytics import build_my_analytics

router = APIRouter(prefix="/views/me", tags=["views-analytics"])


@router.get("/analytics", response_model=MyAnalyticsViewOut)
def my_analytics(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return build_my_analytics(db, user)
