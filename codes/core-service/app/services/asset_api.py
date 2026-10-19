"""CRUD for the personal asset ledger. Other users' rows are 404."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import (
    AssetAdjustment,
    AssetExpenseAdjustment,
    AssetExpenseItem,
    AssetFxRate,
    AssetHolding,
    AssetProfile,
)
from app.models.user import User
from app.schemas.asset import (
    AssetAdjustmentCreate,
    AssetAdjustmentOut,
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
from app.services.assets_math import categories_for, needs_review, recorded_at_error

_NOT_FOUND = "not_found"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def profile_out(db: Session, user: User) -> AssetProfileOut:
    row = _load_profile(db, user.id)
    if row is None:
        return AssetProfileOut(display_currency="CNY", version=0)
    return AssetProfileOut(display_currency=row.display_currency, version=row.version)


def update_profile(db: Session, user: User, payload: AssetProfileUpdate) -> AssetProfileOut:
    row = _load_profile(db, user.id)
    if row is None:
        if payload.version != 0:
            _conflict()
        row = AssetProfile(
            owner_user_id=user.id,
            display_currency=payload.display_currency or "CNY",
            version=1,
        )
        db.add(row)
        db.commit()
        return profile_out(db, user)
    if row.version != payload.version:
        _conflict()
    if "display_currency" in payload.model_fields_set and payload.display_currency:
        row.display_currency = payload.display_currency
    row.version += 1
    db.add(row)
    db.commit()
    return profile_out(db, user)


def list_rates(db: Session, user_id: uuid.UUID) -> list[AssetFxRate]:
    return list(
        db.scalars(select(AssetFxRate).where(AssetFxRate.owner_user_id == user_id)).all()
    )


def upsert_rate(db: Session, user: User, payload: AssetFxRateUpdate) -> AssetFxRateOut:
    row = db.scalar(
        select(AssetFxRate).where(
            AssetFxRate.owner_user_id == user.id,
            AssetFxRate.currency == payload.currency,
        )
    )
    if row is None:
        row = AssetFxRate(
            owner_user_id=user.id,
            currency=payload.currency,
            cny_per_unit=payload.cny_per_unit,
        )
    else:
        row.cny_per_unit = payload.cny_per_unit
    db.add(row)
    db.commit()
    db.refresh(row)
    return _rate_out(row)


def create_holding(db: Session, user: User, payload: AssetHoldingCreate) -> AssetHoldingOut:
    moment = _moment(payload.recorded_at)
    _ensure_profile(db, user.id)
    holding = AssetHolding(
        owner_user_id=user.id,
        name=payload.name,
        kind=payload.kind,
        category=payload.category,
        currency=payload.currency,
        amount_minor=payload.amount_minor,
        institution=payload.institution,
        note=payload.note,
        adjusted_at=moment,
        include_in_net_worth=payload.include_in_net_worth,
        version=1,
    )
    db.add(holding)
    db.flush()
    db.add(
        AssetAdjustment(
            holding_id=holding.id,
            owner_user_id=user.id,
            amount_minor=payload.amount_minor,
            delta_minor=payload.amount_minor,
            reason=payload.reason,
            recorded_at=moment,
        )
    )
    db.commit()
    db.refresh(holding)
    return _holding_out(holding, payload.reason, utcnow().date())


def update_holding(
    db: Session, user: User, holding_id: uuid.UUID, payload: AssetHoldingUpdate
) -> AssetHoldingOut:
    holding = _owned_active_holding(db, user.id, holding_id)
    if holding.version != payload.version:
        _conflict()
    fields = payload.model_fields_set
    kind = payload.kind if "kind" in fields and payload.kind else holding.kind
    category = payload.category if "category" in fields and payload.category else holding.category
    if category not in categories_for(kind):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="category_kind_mismatch")
    if "name" in fields and payload.name:
        holding.name = payload.name
    holding.kind = kind
    holding.category = category
    if "institution" in fields:
        holding.institution = payload.institution
    if "note" in fields:
        holding.note = payload.note
    if "include_in_net_worth" in fields and payload.include_in_net_worth is not None:
        holding.include_in_net_worth = payload.include_in_net_worth
    holding.version += 1
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return _holding_out(holding, _latest_holding_reason(db, holding.id), utcnow().date())


def adjust_holding(
    db: Session, user: User, holding_id: uuid.UUID, payload: AssetAdjustmentCreate
) -> AssetHoldingOut:
    holding = _owned_active_holding(db, user.id, holding_id)
    if holding.version != payload.version:
        _conflict()
    moment = _moment(payload.recorded_at)
    delta = payload.amount_minor - holding.amount_minor
    holding.amount_minor = payload.amount_minor
    holding.adjusted_at = moment
    holding.version += 1
    db.add(holding)
    db.add(
        AssetAdjustment(
            holding_id=holding.id,
            owner_user_id=user.id,
            amount_minor=payload.amount_minor,
            delta_minor=delta,
            reason=payload.reason,
            recorded_at=moment,
        )
    )
    db.commit()
    db.refresh(holding)
    return _holding_out(holding, payload.reason, utcnow().date())


def archive_holding(
    db: Session, user: User, holding_id: uuid.UUID, payload: AssetHoldingArchive
) -> None:
    holding = _owned_active_holding(db, user.id, holding_id)
    if holding.version != payload.version:
        _conflict()
    moment = _moment(payload.recorded_at)
    holding.archived_at = moment
    holding.adjusted_at = moment
    holding.version += 1
    db.add(holding)
    db.add(
        AssetAdjustment(
            holding_id=holding.id,
            owner_user_id=user.id,
            amount_minor=holding.amount_minor,
            delta_minor=0,
            reason=payload.reason,
            recorded_at=moment,
        )
    )
    db.commit()


def holding_detail(db: Session, user: User, holding_id: uuid.UUID) -> AssetHoldingDetailOut:
    holding = _owned_active_holding(db, user.id, holding_id)
    rows = _holding_adjustments(db, holding.id)
    base = _holding_out(holding, rows[0].reason if rows else None, utcnow().date())
    return AssetHoldingDetailOut(
        **base.model_dump(),
        adjustments=[_adjustment_out(row) for row in rows],
    )


def create_expense(db: Session, user: User, payload: AssetExpenseCreate) -> AssetExpenseOut:
    moment = _moment(payload.recorded_at)
    _ensure_profile(db, user.id)
    item = AssetExpenseItem(
        owner_user_id=user.id,
        group_kind=payload.group_kind,
        name=payload.name,
        currency=payload.currency,
        amount_minor=payload.amount_minor,
        adjusted_at=moment,
        version=1,
    )
    db.add(item)
    db.flush()
    db.add(
        AssetExpenseAdjustment(
            expense_item_id=item.id,
            owner_user_id=user.id,
            amount_minor=payload.amount_minor,
            delta_minor=payload.amount_minor,
            reason=payload.reason,
            recorded_at=moment,
        )
    )
    db.commit()
    db.refresh(item)
    return _expense_out(item, payload.reason)


def update_expense(
    db: Session, user: User, item_id: uuid.UUID, payload: AssetExpenseUpdate
) -> AssetExpenseOut:
    item = _owned_active_expense(db, user.id, item_id)
    if item.version != payload.version:
        _conflict()
    if "name" in payload.model_fields_set and payload.name:
        item.name = payload.name
    item.version += 1
    db.add(item)
    db.commit()
    db.refresh(item)
    return _expense_out(item, _latest_expense_reason(db, item.id))


def adjust_expense(
    db: Session, user: User, item_id: uuid.UUID, payload: AssetExpenseAdjust
) -> AssetExpenseOut:
    item = _owned_active_expense(db, user.id, item_id)
    if item.version != payload.version:
        _conflict()
    moment = _moment(payload.recorded_at)
    delta = payload.amount_minor - item.amount_minor
    item.amount_minor = payload.amount_minor
    item.adjusted_at = moment
    item.version += 1
    db.add(item)
    db.add(
        AssetExpenseAdjustment(
            expense_item_id=item.id,
            owner_user_id=user.id,
            amount_minor=payload.amount_minor,
            delta_minor=delta,
            reason=payload.reason,
            recorded_at=moment,
        )
    )
    db.commit()
    db.refresh(item)
    return _expense_out(item, payload.reason)


def archive_expense(
    db: Session, user: User, item_id: uuid.UUID, payload: AssetExpenseArchive
) -> None:
    item = _owned_active_expense(db, user.id, item_id)
    if item.version != payload.version:
        _conflict()
    moment = utcnow()
    item.archived_at = moment
    item.version += 1
    db.add(item)
    db.add(
        AssetExpenseAdjustment(
            expense_item_id=item.id,
            owner_user_id=user.id,
            amount_minor=item.amount_minor,
            delta_minor=0,
            reason=payload.reason,
            recorded_at=moment,
        )
    )
    db.commit()


def expense_detail(db: Session, user: User, item_id: uuid.UUID) -> AssetExpenseDetailOut:
    item = _owned_active_expense(db, user.id, item_id)
    rows = _expense_adjustments(db, item.id)
    base = _expense_out(item, rows[0].reason if rows else None)
    return AssetExpenseDetailOut(
        **base.model_dump(),
        adjustments=[_adjustment_out(row) for row in rows],
    )


def list_active_holdings(db: Session, user_id: uuid.UUID) -> list[AssetHolding]:
    return list(
        db.scalars(
            select(AssetHolding).where(
                AssetHolding.owner_user_id == user_id,
                AssetHolding.archived_at.is_(None),
            )
        ).all()
    )


def list_holding_adjustments(db: Session, holding_ids: list[uuid.UUID]) -> list[AssetAdjustment]:
    if not holding_ids:
        return []
    return list(
        db.scalars(
            select(AssetAdjustment).where(AssetAdjustment.holding_id.in_(holding_ids))
        ).all()
    )


def list_active_expenses(db: Session, user_id: uuid.UUID) -> list[AssetExpenseItem]:
    return list(
        db.scalars(
            select(AssetExpenseItem).where(
                AssetExpenseItem.owner_user_id == user_id,
                AssetExpenseItem.archived_at.is_(None),
            )
        ).all()
    )


def latest_reasons(db: Session, holding_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    rows = list_holding_adjustments(db, holding_ids)
    rows.sort(key=lambda row: row.recorded_at)
    found: dict[uuid.UUID, str] = {}
    for row in rows:
        found[row.holding_id] = row.reason
    return found


def latest_expense_reasons(db: Session, item_ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not item_ids:
        return {}
    rows = list(
        db.scalars(
            select(AssetExpenseAdjustment).where(AssetExpenseAdjustment.expense_item_id.in_(item_ids))
        ).all()
    )
    rows.sort(key=lambda row: row.recorded_at)
    found: dict[uuid.UUID, str] = {}
    for row in rows:
        found[row.expense_item_id] = row.reason
    return found


def _load_profile(db: Session, user_id: uuid.UUID) -> AssetProfile | None:
    return db.scalar(select(AssetProfile).where(AssetProfile.owner_user_id == user_id))


def _ensure_profile(db: Session, user_id: uuid.UUID) -> AssetProfile:
    row = _load_profile(db, user_id)
    if row is not None:
        return row
    row = AssetProfile(owner_user_id=user_id, display_currency="CNY", version=1)
    db.add(row)
    db.flush()
    return row


def _owned_active_holding(db: Session, user_id: uuid.UUID, holding_id: uuid.UUID) -> AssetHolding:
    row = db.get(AssetHolding, holding_id)
    if row is None or row.owner_user_id != user_id or row.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return row


def _owned_active_expense(db: Session, user_id: uuid.UUID, item_id: uuid.UUID) -> AssetExpenseItem:
    row = db.get(AssetExpenseItem, item_id)
    if row is None or row.owner_user_id != user_id or row.archived_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return row


def _moment(value: datetime | None) -> datetime:
    now = utcnow()
    moment = value or now
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    detail = recorded_at_error(moment, now)
    if detail:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    return moment


def _conflict() -> None:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version_conflict")


def _holding_out(row: AssetHolding, reason: str | None, today) -> AssetHoldingOut:
    return AssetHoldingOut(
        id=str(row.id),
        name=row.name,
        kind=row.kind,  # type: ignore[arg-type]
        category=row.category,
        currency=row.currency,
        amount_minor=row.amount_minor,
        institution=row.institution,
        note=row.note,
        adjusted_at=row.adjusted_at,
        include_in_net_worth=row.include_in_net_worth,
        needs_review=needs_review(row.adjusted_at, today),
        version=row.version,
        latest_reason=reason,
    )


def _expense_out(row: AssetExpenseItem, reason: str | None) -> AssetExpenseOut:
    return AssetExpenseOut(
        id=str(row.id),
        group_kind=row.group_kind,  # type: ignore[arg-type]
        name=row.name,
        currency=row.currency,
        amount_minor=row.amount_minor,
        adjusted_at=row.adjusted_at,
        version=row.version,
        latest_reason=reason,
    )


def _adjustment_out(row: AssetAdjustment | AssetExpenseAdjustment) -> AssetAdjustmentOut:
    return AssetAdjustmentOut(
        id=str(row.id),
        amount_minor=row.amount_minor,
        delta_minor=row.delta_minor,
        reason=row.reason,
        recorded_at=row.recorded_at,
    )


def _holding_adjustments(db: Session, holding_id: uuid.UUID) -> list[AssetAdjustment]:
    rows = list(
        db.scalars(select(AssetAdjustment).where(AssetAdjustment.holding_id == holding_id)).all()
    )
    rows.sort(key=lambda row: row.recorded_at, reverse=True)
    return rows


def _expense_adjustments(db: Session, item_id: uuid.UUID) -> list[AssetExpenseAdjustment]:
    rows = list(
        db.scalars(
            select(AssetExpenseAdjustment).where(AssetExpenseAdjustment.expense_item_id == item_id)
        ).all()
    )
    rows.sort(key=lambda row: row.recorded_at, reverse=True)
    return rows


def _latest_holding_reason(db: Session, holding_id: uuid.UUID) -> str | None:
    rows = _holding_adjustments(db, holding_id)
    return rows[0].reason if rows else None


def _latest_expense_reason(db: Session, item_id: uuid.UUID) -> str | None:
    rows = _expense_adjustments(db, item_id)
    return rows[0].reason if rows else None


def _rate_out(row: AssetFxRate) -> AssetFxRateOut:
    quantized = Decimal(row.cny_per_unit).quantize(Decimal("0.00000001"))
    text = f"{quantized:f}".rstrip("0").rstrip(".")
    return AssetFxRateOut(currency=row.currency, cny_per_unit=text or "0", updated_at=row.updated_at)
