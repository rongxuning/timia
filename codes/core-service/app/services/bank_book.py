"""Writes for savings, investment, and credit products on a bank account."""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import (
    AssetAccount,
    AssetBankCreditBill,
    AssetBankFlow,
    AssetBankInvestmentOp,
    AssetBankProduct,
    AssetBankSavingsTxn,
)
from app.models.user import User
from app.schemas.bank import (
    BANK_FLOW_CATEGORIES,
    BankCreditBillCreate,
    BankFlowCreate,
    BankInvestmentOpCreate,
    BankProductCreate,
    BankProductWriteOut,
    BankSavingsTxnCreate,
)
from app.services.asset_api import _ensure_profile, _moment
from app.services.assets_math import CURRENCIES, MAX_MINOR

BANK_ACCOUNT_KINDS = frozenset({"savings", "credit"})
_YEAR_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def create_product(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    payload: BankProductCreate,
) -> BankProductWriteOut:
    _ensure_profile(db, user.id)
    account = _bank_account(db, user.id, account_id)
    name = _required_text(payload.name, "name_required")
    reason = _required_text(payload.reason, "reason_required")
    currency = _currency(payload.currency)
    moment = _moment(payload.recorded_at)
    product = AssetBankProduct(
        owner_user_id=user.id,
        account_id=account.id,
        name=name,
        product_kind=payload.product_kind,
        currency=currency,
        balance_minor=0,
        value_minor=0,
        cost_minor=0,
        limit_minor=0,
        statement_minor=0,
        paid_off=True,
        marked_at=moment,
        version=1,
    )
    if payload.product_kind == "savings":
        product.balance_minor = payload.balance_minor or 0
    elif payload.product_kind == "investment":
        product.value_minor = payload.value_minor or 0
        product.cost_minor = payload.cost_minor or 0
    else:
        product.limit_minor = payload.limit_minor or 0
        product.statement_minor = payload.statement_minor or 0
        product.paid_off = bool(payload.paid_off)
    db.add(product)
    db.flush()
    if payload.product_kind == "savings":
        db.add(
            AssetBankSavingsTxn(
                product_id=product.id,
                owner_user_id=user.id,
                balance_minor=product.balance_minor,
                delta_minor=product.balance_minor,
                reason=reason,
                recorded_at=moment,
            )
        )
    elif payload.product_kind == "investment":
        db.add(
            AssetBankInvestmentOp(
                product_id=product.id,
                owner_user_id=user.id,
                value_minor=product.value_minor,
                cost_minor=product.cost_minor,
                cost_delta_minor=product.cost_minor,
                reason=reason,
                recorded_at=moment,
            )
        )
    else:
        zone = _zone(payload.timezone, moment)
        year_month = moment.astimezone(zone).strftime("%Y-%m")
        db.add(
            AssetBankCreditBill(
                product_id=product.id,
                owner_user_id=user.id,
                year_month=year_month,
                limit_minor=product.limit_minor,
                statement_minor=product.statement_minor,
                paid_off=product.paid_off,
                reason=reason,
                recorded_at=moment,
            )
        )
    db.commit()
    db.refresh(product)
    return _write_out(product)


def add_savings_txn(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: BankSavingsTxnCreate,
) -> BankProductWriteOut:
    _ensure_profile(db, user.id)
    account = _bank_account(db, user.id, account_id)
    product = _product(db, user.id, account.id, product_id, "savings")
    if product.version != payload.version:
        raise HTTPException(status_code=409, detail="version_conflict")
    reason = _required_text(payload.reason, "reason_required")
    _amount(payload.balance_minor)
    moment = _moment(payload.recorded_at)
    zone = _zone(payload.timezone, moment)
    day = moment.astimezone(zone).date()
    txns = list(
        db.scalars(select(AssetBankSavingsTxn).where(AssetBankSavingsTxn.product_id == product.id)).all()
    )
    prior_balance = _prior_before_day(txns, zone, day, "balance_minor")
    same_day = [row for row in txns if _on_local_day(row.recorded_at, zone, day)]
    if same_day:
        winner = max(same_day, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
        for extra in same_day:
            if extra.id != winner.id:
                db.delete(extra)
        winner.balance_minor = payload.balance_minor
        winner.delta_minor = payload.balance_minor - prior_balance
        winner.reason = reason
        winner.recorded_at = moment
    else:
        db.add(
            AssetBankSavingsTxn(
                product_id=product.id,
                owner_user_id=user.id,
                balance_minor=payload.balance_minor,
                delta_minor=payload.balance_minor - prior_balance,
                reason=reason,
                recorded_at=moment,
            )
        )
    db.flush()
    _sync_savings_latest(db, product)
    db.commit()
    db.refresh(product)
    return _write_out(product)


def add_investment_op(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: BankInvestmentOpCreate,
) -> BankProductWriteOut:
    _ensure_profile(db, user.id)
    account = _bank_account(db, user.id, account_id)
    product = _product(db, user.id, account.id, product_id, "investment")
    if product.version != payload.version:
        raise HTTPException(status_code=409, detail="version_conflict")
    reason = _required_text(payload.reason, "reason_required")
    _amount(payload.value_minor)
    if abs(payload.cost_minor) > MAX_MINOR:
        raise HTTPException(status_code=400, detail="amount_invalid")
    moment = _moment(payload.recorded_at)
    zone = _zone(payload.timezone, moment)
    day = moment.astimezone(zone).date()
    ops = list(
        db.scalars(
            select(AssetBankInvestmentOp).where(AssetBankInvestmentOp.product_id == product.id)
        ).all()
    )
    prior_cost = _prior_before_day(ops, zone, day, "cost_minor")
    same_day = [row for row in ops if _on_local_day(row.recorded_at, zone, day)]
    if same_day:
        winner = max(same_day, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
        for extra in same_day:
            if extra.id != winner.id:
                db.delete(extra)
        winner.value_minor = payload.value_minor
        winner.cost_minor = payload.cost_minor
        winner.cost_delta_minor = payload.cost_minor - prior_cost
        winner.reason = reason
        winner.recorded_at = moment
    else:
        db.add(
            AssetBankInvestmentOp(
                product_id=product.id,
                owner_user_id=user.id,
                value_minor=payload.value_minor,
                cost_minor=payload.cost_minor,
                cost_delta_minor=payload.cost_minor - prior_cost,
                reason=reason,
                recorded_at=moment,
            )
        )
    db.flush()
    _sync_investment_latest(db, product)
    db.commit()
    db.refresh(product)
    return _write_out(product)


def add_credit_bill(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: BankCreditBillCreate,
) -> BankProductWriteOut:
    _ensure_profile(db, user.id)
    account = _bank_account(db, user.id, account_id)
    product = _product(db, user.id, account.id, product_id, "credit")
    if product.version != payload.version:
        raise HTTPException(status_code=409, detail="version_conflict")
    reason = _required_text(payload.reason, "reason_required")
    year_month = _year_month(payload.year_month)
    _amount(payload.limit_minor)
    _amount(payload.statement_minor)
    moment = _moment(payload.recorded_at)
    existing = db.scalar(
        select(AssetBankCreditBill).where(
            AssetBankCreditBill.product_id == product.id,
            AssetBankCreditBill.year_month == year_month,
        )
    )
    if existing is None:
        db.add(
            AssetBankCreditBill(
                product_id=product.id,
                owner_user_id=user.id,
                year_month=year_month,
                limit_minor=payload.limit_minor,
                statement_minor=payload.statement_minor,
                paid_off=payload.paid_off,
                reason=reason,
                recorded_at=moment,
            )
        )
    else:
        existing.limit_minor = payload.limit_minor
        existing.statement_minor = payload.statement_minor
        existing.paid_off = payload.paid_off
        existing.reason = reason
        existing.recorded_at = moment
    db.flush()
    _sync_credit_latest(db, product)
    db.commit()
    db.refresh(product)
    return _write_out(product)


def add_flow(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    payload: BankFlowCreate,
) -> None:
    _ensure_profile(db, user.id)
    account = _bank_account(db, user.id, account_id)
    if payload.category not in BANK_FLOW_CATEGORIES[payload.direction]:
        raise HTTPException(status_code=400, detail="category_invalid")
    currency = _currency(payload.currency)
    db.add(
        AssetBankFlow(
            owner_user_id=user.id,
            account_id=account.id,
            direction=payload.direction,
            category=payload.category,
            currency=currency,
            amount_minor=payload.amount_minor,
            recorded_at=_moment(payload.recorded_at),
        )
    )
    db.commit()


def _sync_savings_latest(db: Session, product: AssetBankProduct) -> None:
    txns = list(
        db.scalars(select(AssetBankSavingsTxn).where(AssetBankSavingsTxn.product_id == product.id)).all()
    )
    latest = max(txns, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
    product.balance_minor = latest.balance_minor
    product.marked_at = latest.recorded_at
    product.version += 1


def _sync_investment_latest(db: Session, product: AssetBankProduct) -> None:
    ops = list(
        db.scalars(
            select(AssetBankInvestmentOp).where(AssetBankInvestmentOp.product_id == product.id)
        ).all()
    )
    latest = max(ops, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
    product.value_minor = latest.value_minor
    product.cost_minor = latest.cost_minor
    product.marked_at = latest.recorded_at
    product.version += 1


def _sync_credit_latest(db: Session, product: AssetBankProduct) -> None:
    bills = list(
        db.scalars(
            select(AssetBankCreditBill).where(AssetBankCreditBill.product_id == product.id)
        ).all()
    )
    latest = max(bills, key=lambda row: (row.year_month, row.recorded_at, row.created_at, str(row.id)))
    product.limit_minor = latest.limit_minor
    product.statement_minor = latest.statement_minor
    product.paid_off = latest.paid_off
    product.marked_at = latest.recorded_at
    product.version += 1


def _prior_before_day(rows: list, zone, day: date, field: str) -> int:
    earlier = [row for row in rows if _local_day(row.recorded_at, zone) < day]
    if not earlier:
        return 0
    prior = max(earlier, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
    return int(getattr(prior, field))


def _local_day(moment: datetime, zone) -> date:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo("UTC"))
    return moment.astimezone(zone).date()


def _bank_account(db: Session, user_id: uuid.UUID, account_id: uuid.UUID) -> AssetAccount:
    row = db.scalar(
        select(AssetAccount).where(
            AssetAccount.id == account_id,
            AssetAccount.owner_user_id == user_id,
            AssetAccount.archived_at.is_(None),
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    if row.account_kind not in BANK_ACCOUNT_KINDS:
        raise HTTPException(status_code=400, detail="account_not_bank")
    return row


def _product(
    db: Session,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    product_id: uuid.UUID,
    kind: str,
) -> AssetBankProduct:
    row = db.scalar(
        select(AssetBankProduct).where(
            AssetBankProduct.id == product_id,
            AssetBankProduct.account_id == account_id,
            AssetBankProduct.owner_user_id == user_id,
            AssetBankProduct.archived_at.is_(None),
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    if row.product_kind != kind:
        raise HTTPException(status_code=400, detail="product_kind_mismatch")
    return row


def _required_text(value: str, detail: str) -> str:
    text = value.strip()
    if not text:
        raise HTTPException(status_code=400, detail=detail)
    return text


def _currency(value: str) -> str:
    currency = value.strip().upper()
    if currency not in CURRENCIES:
        raise HTTPException(status_code=400, detail="unsupported_currency")
    return currency


def _amount(value: int) -> None:
    if value < 0 or value > MAX_MINOR:
        raise HTTPException(status_code=400, detail="amount_invalid")


def _year_month(value: str) -> str:
    text = value.strip()
    if _YEAR_MONTH.fullmatch(text) is None:
        raise HTTPException(status_code=400, detail="year_month_invalid")
    return text


def _zone(name: str | None, moment: datetime) -> tzinfo:
    text = (name or "").strip()
    if text:
        try:
            return ZoneInfo(text)
        except (ZoneInfoNotFoundError, KeyError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="timezone_invalid") from exc
    return moment.tzinfo or ZoneInfo("UTC")


def _on_local_day(moment: datetime, zone, day) -> bool:
    return _local_day(moment, zone) == day


def _write_out(product: AssetBankProduct) -> BankProductWriteOut:
    return BankProductWriteOut(
        id=str(product.id),
        name=product.name,
        product_kind=product.product_kind,  # type: ignore[arg-type]
        currency=product.currency,
        balance_minor=product.balance_minor,
        value_minor=product.value_minor,
        cost_minor=product.cost_minor,
        limit_minor=product.limit_minor,
        statement_minor=product.statement_minor,
        paid_off=product.paid_off,
        version=product.version,
    )
