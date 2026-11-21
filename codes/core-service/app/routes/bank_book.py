"""Bank products under a savings or credit account."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.bank import (
    BankCreditBillCreate,
    BankInvestmentOpCreate,
    BankProductCreate,
    BankProductWriteOut,
    BankSavingsTxnCreate,
)
from app.services.bank_book import (
    add_credit_bill,
    add_investment_op,
    add_savings_txn,
    create_product,
)

router = APIRouter(prefix="/asset-accounts", tags=["assets"])


@router.post(
    "/{account_id}/bank-products",
    response_model=BankProductWriteOut,
    status_code=status.HTTP_201_CREATED,
)
def post_bank_product(
    account_id: uuid.UUID,
    payload: BankProductCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return create_product(db, user, account_id, payload)


@router.post(
    "/{account_id}/bank-products/{product_id}/savings-txns",
    response_model=BankProductWriteOut,
)
def post_savings_txn(
    account_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: BankSavingsTxnCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return add_savings_txn(db, user, account_id, product_id, payload)


@router.post(
    "/{account_id}/bank-products/{product_id}/investment-ops",
    response_model=BankProductWriteOut,
)
def post_investment_op(
    account_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: BankInvestmentOpCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return add_investment_op(db, user, account_id, product_id, payload)


@router.post(
    "/{account_id}/bank-products/{product_id}/credit-bills",
    response_model=BankProductWriteOut,
)
def post_credit_bill(
    account_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: BankCreditBillCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return add_credit_bill(db, user, account_id, product_id, payload)
