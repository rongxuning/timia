"""Stock positions, cash marks, and bank transfers for one stock account."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.stock import (
    StockCashCreate,
    StockFrozenCreate,
    StockMarkCreate,
    StockPositionCreate,
    StockPositionWriteOut,
    StockTransferCreate,
)
from app.services.stock_book import add_mark, add_transfer, create_position, set_cash, set_frozen

router = APIRouter(prefix="/asset-accounts", tags=["assets"])


@router.post(
    "/{account_id}/stocks",
    response_model=StockPositionWriteOut,
    status_code=status.HTTP_201_CREATED,
)
def post_stock(
    account_id: uuid.UUID,
    payload: StockPositionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return create_position(db, user, account_id, payload)


@router.post(
    "/{account_id}/stocks/{position_id}/marks",
    response_model=StockPositionWriteOut,
)
def post_stock_mark(
    account_id: uuid.UUID,
    position_id: uuid.UUID,
    payload: StockMarkCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return add_mark(db, user, account_id, position_id, payload)


@router.post("/{account_id}/stock-cash", status_code=status.HTTP_204_NO_CONTENT)
def post_stock_cash(
    account_id: uuid.UUID,
    payload: StockCashCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    set_cash(db, user, account_id, payload)


@router.post("/{account_id}/stock-frozen", status_code=status.HTTP_204_NO_CONTENT)
def post_stock_frozen(
    account_id: uuid.UUID,
    payload: StockFrozenCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    set_frozen(db, user, account_id, payload)


@router.post("/{account_id}/stock-transfers", status_code=status.HTTP_204_NO_CONTENT)
def post_stock_transfer(
    account_id: uuid.UUID,
    payload: StockTransferCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    add_transfer(db, user, account_id, payload)
