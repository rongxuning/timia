"""Writes for stocks, cash, and bank transfers on a stock account."""

from __future__ import annotations

import re
import uuid
from datetime import datetime, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import (
    AssetAccount,
    AssetStockCash,
    AssetStockMark,
    AssetStockPosition,
    AssetStockTransfer,
)
from app.models.user import User
from app.schemas.stock import (
    StockCashCreate,
    StockMarkCreate,
    StockPositionCreate,
    StockPositionWriteOut,
    StockTransferCreate,
)
from app.services.asset_api import _ensure_profile, _moment
from app.services.assets_math import CURRENCIES, MAX_MINOR

_SYMBOL = re.compile(r"^[A-Z0-9]{1,12}$")
_MARKET_CURRENCY = {"a_share": "CNY", "hk_share": "HKD"}


def create_position(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    payload: StockPositionCreate,
) -> StockPositionWriteOut:
    _ensure_profile(db, user.id)
    account = _stock_account(db, user.id, account_id)
    symbol = _symbol(payload.symbol)
    name = _required_text(payload.name, "name_required")
    reason = _required_text(payload.reason, "reason_required")
    _prices(payload.shares, payload.cost_price_minor, payload.market_price_minor)
    currency = _MARKET_CURRENCY[payload.market]
    taken = db.scalar(
        select(AssetStockPosition.id).where(
            AssetStockPosition.account_id == account.id,
            AssetStockPosition.symbol == symbol,
            AssetStockPosition.archived_at.is_(None),
        )
    )
    if taken is not None:
        raise HTTPException(status_code=409, detail="symbol_taken")
    moment = _moment(payload.recorded_at)
    position = AssetStockPosition(
        owner_user_id=user.id,
        account_id=account.id,
        symbol=symbol,
        name=name,
        market=payload.market,
        currency=currency,
        shares=payload.shares,
        cost_price_minor=payload.cost_price_minor,
        market_price_minor=payload.market_price_minor,
        marked_at=moment,
        version=1,
    )
    db.add(position)
    db.flush()
    db.add(_mark(position, reason, moment))
    db.commit()
    db.refresh(position)
    return _write_out(position)


def add_mark(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    position_id: uuid.UUID,
    payload: StockMarkCreate,
) -> StockPositionWriteOut:
    _ensure_profile(db, user.id)
    account = _stock_account(db, user.id, account_id)
    position = _position(db, user.id, account.id, position_id)
    if position.version != payload.version:
        raise HTTPException(status_code=409, detail="version_conflict")
    reason = _required_text(payload.reason, "reason_required")
    _prices(payload.shares, payload.cost_price_minor, payload.market_price_minor)
    moment = _moment(payload.recorded_at)
    zone = _mark_zone(payload.timezone, moment)
    marks = list(
        db.scalars(select(AssetStockMark).where(AssetStockMark.position_id == position.id)).all()
    )
    day = moment.astimezone(zone).date()
    same_day = [row for row in marks if _on_local_day(row.recorded_at, zone, day)]
    if same_day:
        winner = max(same_day, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
        for extra in same_day:
            if extra.id != winner.id:
                db.delete(extra)
        winner.shares = payload.shares
        winner.cost_price_minor = payload.cost_price_minor
        winner.market_price_minor = payload.market_price_minor
        winner.reason = reason
        winner.recorded_at = moment
    else:
        db.add(
            AssetStockMark(
                position_id=position.id,
                owner_user_id=user.id,
                shares=payload.shares,
                cost_price_minor=payload.cost_price_minor,
                market_price_minor=payload.market_price_minor,
                reason=reason,
                recorded_at=moment,
            )
        )
    db.flush()
    _sync_latest(db, position)
    db.commit()
    db.refresh(position)
    return _write_out(position)


def set_cash(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    payload: StockCashCreate,
) -> None:
    _ensure_profile(db, user.id)
    account = _stock_account(db, user.id, account_id)
    currency = _currency(payload.currency)
    if payload.amount_minor < 0 or payload.amount_minor > MAX_MINOR:
        raise HTTPException(status_code=400, detail="amount_invalid")
    reason = _required_text(payload.reason, "reason_required")
    moment = _moment(payload.recorded_at)
    db.add(
        AssetStockCash(
            account_id=account.id,
            owner_user_id=user.id,
            currency=currency,
            amount_minor=payload.amount_minor,
            reason=reason,
            recorded_at=moment,
        )
    )
    db.commit()


def add_transfer(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    payload: StockTransferCreate,
) -> None:
    _ensure_profile(db, user.id)
    account = _stock_account(db, user.id, account_id)
    currency = _currency(payload.currency)
    if payload.amount_minor > MAX_MINOR:
        raise HTTPException(status_code=400, detail="amount_invalid")
    reason = _required_text(payload.reason, "reason_required")
    moment = _moment(payload.recorded_at)
    db.add(
        AssetStockTransfer(
            account_id=account.id,
            owner_user_id=user.id,
            direction=payload.direction,
            currency=currency,
            amount_minor=payload.amount_minor,
            reason=reason,
            recorded_at=moment,
        )
    )
    db.commit()


def _stock_account(db: Session, user_id: uuid.UUID, account_id: uuid.UUID) -> AssetAccount:
    row = db.scalar(
        select(AssetAccount).where(
            AssetAccount.id == account_id,
            AssetAccount.owner_user_id == user_id,
            AssetAccount.archived_at.is_(None),
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    if row.account_kind != "stock":
        raise HTTPException(status_code=400, detail="account_not_stock")
    return row


def _position(
    db: Session,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    position_id: uuid.UUID,
) -> AssetStockPosition:
    row = db.scalar(
        select(AssetStockPosition).where(
            AssetStockPosition.id == position_id,
            AssetStockPosition.account_id == account_id,
            AssetStockPosition.owner_user_id == user_id,
            AssetStockPosition.archived_at.is_(None),
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    return row


def _required_text(value: str, detail: str) -> str:
    text = value.strip()
    if not text:
        raise HTTPException(status_code=400, detail=detail)
    return text


def _symbol(value: str) -> str:
    symbol = value.strip().upper()
    if _SYMBOL.fullmatch(symbol) is None:
        raise HTTPException(status_code=400, detail="symbol_invalid")
    return symbol


def _currency(value: str) -> str:
    currency = value.strip().upper()
    if currency not in CURRENCIES:
        raise HTTPException(status_code=400, detail="unsupported_currency")
    return currency


def _prices(shares: int, cost_price_minor: int, market_price_minor: int) -> None:
    if shares < 0 or market_price_minor < 0:
        raise HTTPException(status_code=400, detail="amount_invalid")
    if (
        shares > MAX_MINOR
        or abs(cost_price_minor) > MAX_MINOR
        or market_price_minor > MAX_MINOR
    ):
        raise HTTPException(status_code=400, detail="amount_invalid")
    if abs(shares * cost_price_minor) > MAX_MINOR or shares * market_price_minor > MAX_MINOR:
        raise HTTPException(status_code=400, detail="amount_invalid")


def _mark_zone(name: str | None, moment: datetime) -> tzinfo:
    text = (name or "").strip()
    if text:
        try:
            return ZoneInfo(text)
        except (ZoneInfoNotFoundError, KeyError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="timezone_invalid") from exc
    return moment.tzinfo or ZoneInfo("UTC")


def _on_local_day(moment: datetime, zone, day) -> bool:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo("UTC"))
    return moment.astimezone(zone).date() == day


def _mark(position: AssetStockPosition, reason: str, moment) -> AssetStockMark:
    return AssetStockMark(
        position_id=position.id,
        owner_user_id=position.owner_user_id,
        shares=position.shares,
        cost_price_minor=position.cost_price_minor,
        market_price_minor=position.market_price_minor,
        reason=reason,
        recorded_at=moment,
    )


def _sync_latest(db: Session, position: AssetStockPosition) -> None:
    marks = list(
        db.scalars(
            select(AssetStockMark).where(AssetStockMark.position_id == position.id)
        ).all()
    )
    latest = max(marks, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
    position.shares = latest.shares
    position.cost_price_minor = latest.cost_price_minor
    position.market_price_minor = latest.market_price_minor
    position.marked_at = latest.recorded_at
    position.version += 1


def _write_out(position: AssetStockPosition) -> StockPositionWriteOut:
    return StockPositionWriteOut(
        id=str(position.id),
        symbol=position.symbol,
        name=position.name,
        market=position.market,  # type: ignore[arg-type]
        currency=position.currency,
        shares=position.shares,
        cost_price_minor=position.cost_price_minor,
        market_price_minor=position.market_price_minor,
        version=position.version,
    )
