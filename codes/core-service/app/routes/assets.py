"""Personal asset ledger. Private to the owner; missing or foreign ids are 404."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.asset import (
    AssetAdjustmentCreate,
    AssetBookOpen,
    AssetBookOpenOut,
    AssetExpenseAdjust,
    AssetExpenseArchive,
    AssetExpenseCreate,
    AssetExpenseDetailOut,
    AssetExpenseOut,
    AssetExpenseUpdate,
    AssetFxRateOut,
    AssetFxRateUpdate,
    AssetHoldingArchive,
    AssetHoldingCreate,
    AssetHoldingDetailOut,
    AssetHoldingOut,
    AssetHoldingUpdate,
    AssetProfileOut,
    AssetProfileUpdate,
)
from app.services.asset_book import open_book
from app.services.asset_api import (
    adjust_expense,
    adjust_holding,
    archive_expense,
    archive_holding,
    create_expense,
    create_holding,
    expense_detail,
    holding_detail,
    profile_out,
    update_expense,
    update_holding,
    update_profile,
    upsert_rate,
)

router = APIRouter(prefix="/asset-holdings", tags=["assets"])
profile_router = APIRouter(prefix="/asset-profile", tags=["assets"])
rate_router = APIRouter(prefix="/asset-fx-rates", tags=["assets"])
expense_router = APIRouter(prefix="/asset-expenses", tags=["assets"])
book_router = APIRouter(prefix="/asset-book", tags=["assets"])


@book_router.post("/open", response_model=AssetBookOpenOut, status_code=status.HTTP_201_CREATED)
def post_open_asset_book(
    payload: AssetBookOpen,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return open_book(db, user, payload)


@profile_router.get("", response_model=AssetProfileOut)
def get_asset_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return profile_out(db, user)


@profile_router.put("", response_model=AssetProfileOut)
def put_asset_profile(
    payload: AssetProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return update_profile(db, user, payload)


@rate_router.put("", response_model=AssetFxRateOut)
def put_asset_fx_rate(
    payload: AssetFxRateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return upsert_rate(db, user, payload)


@router.post("", response_model=AssetHoldingOut, status_code=status.HTTP_201_CREATED)
def post_asset_holding(
    payload: AssetHoldingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return create_holding(db, user, payload)


@router.get("/{holding_id}", response_model=AssetHoldingDetailOut)
def get_asset_holding(
    holding_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return holding_detail(db, user, holding_id)


@router.patch("/{holding_id}", response_model=AssetHoldingOut)
def patch_asset_holding(
    holding_id: uuid.UUID,
    payload: AssetHoldingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return update_holding(db, user, holding_id, payload)


@router.post("/{holding_id}/adjustments", response_model=AssetHoldingOut)
def post_asset_adjustment(
    holding_id: uuid.UUID,
    payload: AssetAdjustmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return adjust_holding(db, user, holding_id, payload)


@router.post("/{holding_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def post_archive_asset_holding(
    holding_id: uuid.UUID,
    payload: AssetHoldingArchive,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    archive_holding(db, user, holding_id, payload)


@expense_router.post("", response_model=AssetExpenseOut, status_code=status.HTTP_201_CREATED)
def post_asset_expense(
    payload: AssetExpenseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return create_expense(db, user, payload)


@expense_router.get("/{item_id}", response_model=AssetExpenseDetailOut)
def get_asset_expense(
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return expense_detail(db, user, item_id)


@expense_router.patch("/{item_id}", response_model=AssetExpenseOut)
def patch_asset_expense(
    item_id: uuid.UUID,
    payload: AssetExpenseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return update_expense(db, user, item_id, payload)


@expense_router.post("/{item_id}/adjustments", response_model=AssetExpenseOut)
def post_asset_expense_adjustment(
    item_id: uuid.UUID,
    payload: AssetExpenseAdjust,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return adjust_expense(db, user, item_id, payload)


@expense_router.post("/{item_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def post_archive_asset_expense(
    item_id: uuid.UUID,
    payload: AssetExpenseArchive,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    archive_expense(db, user, item_id, payload)
