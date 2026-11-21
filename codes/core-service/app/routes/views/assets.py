import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.assets import MyAssetsViewOut
from app.schemas.views.bank_detail import BankDetailOut
from app.schemas.views.stock_detail import StockDetailOut
from app.services.views.bank_detail import build_bank_detail
from app.services.views.my_assets import build_my_assets
from app.services.views.stock_detail import build_stock_detail

router = APIRouter(prefix="/views/me", tags=["views-assets"])


@router.get("/assets", response_model=MyAssetsViewOut)
def my_assets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return build_my_assets(db, user)


@router.get("/assets/accounts/{account_id}/stocks", response_model=StockDetailOut)
def my_stock_account(
    account_id: uuid.UUID,
    start: date = Query(),
    end: date = Query(),
    zone_name: str = Query(default="Asia/Shanghai", alias="timezone"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return build_stock_detail(db, user, account_id, start, end, zone_name)


@router.get("/assets/accounts/{account_id}/bank", response_model=BankDetailOut)
def my_bank_account(
    account_id: uuid.UUID,
    start: date = Query(),
    end: date = Query(),
    zone_name: str = Query(default="Asia/Shanghai", alias="timezone"),
    product_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return build_bank_detail(db, user, account_id, start, end, zone_name, product_id)
