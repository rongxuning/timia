"""CRUD for the personal asset ledger. Other users' rows are 404."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import AssetHolding, AssetProfile, AssetValuation
from app.models.user import User
from app.schemas.asset import (
    AssetHoldingArchive,
    AssetHoldingConfirm,
    AssetHoldingCreate,
    AssetHoldingOut,
    AssetHoldingUpdate,
    AssetProfileOut,
    AssetProfileUpdate,
)
from app.services.assets_math import as_of_error, categories_for, needs_review

def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def _holding_out(row: AssetHolding, today: date) -> AssetHoldingOut:
    return AssetHoldingOut(
        id=str(row.id),
        name=row.name,
        kind=row.kind,  # type: ignore[arg-type]
        category=row.category,
        amount_minor=row.amount_minor,
        institution=row.institution,
        note=row.note,
        as_of=row.as_of,
        include_in_net_worth=row.include_in_net_worth,
        needs_review=needs_review(row.as_of, today),
        version=row.version,
    )


def profile_out(db: Session, user: User) -> AssetProfileOut:
    row = _load_profile(db, user.id)
    locked = _has_any_holding(db, user.id)
    if row is None:
        return AssetProfileOut(
            currency="CNY",
            monthly_essential_minor=None,
            version=0,
            currency_locked=locked,
        )
    return AssetProfileOut(
        currency=row.currency,
        monthly_essential_minor=row.monthly_essential_minor,
        version=row.version,
        currency_locked=locked,
    )


def update_profile(db: Session, user: User, payload: AssetProfileUpdate) -> AssetProfileOut:
    row = _load_profile(db, user.id)
    if row is None:
        if payload.version != 0:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version_conflict")
        row = AssetProfile(
            owner_user_id=user.id,
            currency=payload.currency or "CNY",
            monthly_essential_minor=_essential(payload),
            version=1,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return profile_out(db, user)

    if row.version != payload.version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version_conflict")

    fields = payload.model_fields_set
    if "currency" in fields and payload.currency and payload.currency != row.currency:
        if _has_any_holding(db, user.id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="currency_has_holdings")
        row.currency = payload.currency
    if "monthly_essential_minor" in fields:
        row.monthly_essential_minor = _essential(payload)
    row.version += 1
    db.add(row)
    db.commit()
    return profile_out(db, user)


def create_holding(db: Session, user: User, payload: AssetHoldingCreate) -> AssetHoldingOut:
    today = utc_today()
    _reject_as_of(payload.as_of, today)
    _ensure_profile(db, user.id)
    holding = AssetHolding(
        owner_user_id=user.id,
        name=payload.name,
        kind=payload.kind,
        category=payload.category,
        amount_minor=payload.amount_minor,
        institution=payload.institution,
        note=payload.note,
        as_of=payload.as_of,
        include_in_net_worth=payload.include_in_net_worth,
        version=1,
    )
    db.add(holding)
    db.flush()
    db.add(_valuation(holding))
    db.commit()
    db.refresh(holding)
    return _holding_out(holding, today)


def update_holding(
    db: Session, user: User, holding_id: uuid.UUID, payload: AssetHoldingUpdate
) -> AssetHoldingOut:
    today = utc_today()
    holding = _owned_active(db, user.id, holding_id)
    if holding.version != payload.version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version_conflict")

    fields = payload.model_fields_set
    kind = holding.kind
    if "kind" in fields and payload.kind is not None:
        kind = payload.kind
    category = holding.category
    if "category" in fields and payload.category is not None:
        category = payload.category
    if category not in categories_for(kind):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="category_kind_mismatch")
    amount = holding.amount_minor
    if "amount_minor" in fields and payload.amount_minor is not None:
        amount = payload.amount_minor
    as_of = holding.as_of
    if "as_of" in fields and payload.as_of is not None:
        as_of = payload.as_of
    if "as_of" in fields and payload.as_of is not None:
        _reject_as_of(payload.as_of, today)

    value_changed = amount != holding.amount_minor or as_of != holding.as_of
    if "name" in fields and payload.name is not None:
        holding.name = payload.name
    holding.kind = kind
    holding.category = category
    holding.amount_minor = amount
    holding.as_of = as_of
    if "institution" in fields:
        holding.institution = payload.institution
    if "note" in fields:
        holding.note = payload.note
    if "include_in_net_worth" in fields and payload.include_in_net_worth is not None:
        holding.include_in_net_worth = payload.include_in_net_worth
    holding.version += 1
    db.add(holding)
    if value_changed:
        db.add(_valuation(holding))
    db.commit()
    db.refresh(holding)
    return _holding_out(holding, today)


def confirm_holding(
    db: Session, user: User, holding_id: uuid.UUID, payload: AssetHoldingConfirm
) -> AssetHoldingOut:
    today = utc_today()
    holding = _owned_active(db, user.id, holding_id)
    if holding.version != payload.version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version_conflict")
    _reject_as_of(payload.as_of, today)
    if payload.as_of == holding.as_of:
        return _holding_out(holding, today)
    holding.as_of = payload.as_of
    holding.version += 1
    db.add(holding)
    db.add(_valuation(holding))
    db.commit()
    db.refresh(holding)
    return _holding_out(holding, today)


def archive_holding(
    db: Session, user: User, holding_id: uuid.UUID, payload: AssetHoldingArchive
) -> None:
    holding = _owned_active(db, user.id, holding_id)
    if holding.version != payload.version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version_conflict")
    holding.archived_at = datetime.now(timezone.utc)
    holding.version += 1
    db.add(holding)
    db.commit()


def list_active_holdings(db: Session, user_id: uuid.UUID) -> list[AssetHolding]:
    rows = list(
        db.scalars(
            select(AssetHolding).where(
                AssetHolding.owner_user_id == user_id,
                AssetHolding.archived_at.is_(None),
            )
        ).all()
    )
    return rows


def list_valuations(db: Session, holding_ids: list[uuid.UUID]) -> list[AssetValuation]:
    if not holding_ids:
        return []
    return list(
        db.scalars(select(AssetValuation).where(AssetValuation.holding_id.in_(holding_ids))).all()
    )


def _load_profile(db: Session, user_id: uuid.UUID) -> AssetProfile | None:
    return db.scalar(select(AssetProfile).where(AssetProfile.owner_user_id == user_id))


def _ensure_profile(db: Session, user_id: uuid.UUID) -> AssetProfile:
    row = _load_profile(db, user_id)
    if row is not None:
        return row
    row = AssetProfile(owner_user_id=user_id, currency="CNY", monthly_essential_minor=None, version=1)
    db.add(row)
    db.flush()
    return row


def _has_any_holding(db: Session, user_id: uuid.UUID) -> bool:
    found = db.scalar(
        select(AssetHolding.id).where(AssetHolding.owner_user_id == user_id).limit(1)
    )
    return found is not None


def _owned_active(db: Session, user_id: uuid.UUID, holding_id: uuid.UUID) -> AssetHolding:
    row = db.get(AssetHolding, holding_id)
    if row is None or row.owner_user_id != user_id or row.archived_at is not None:
        raise _not_found()
    return row


def _reject_as_of(as_of: date, today: date) -> None:
    detail = as_of_error(as_of, today)
    if detail:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _essential(payload: AssetProfileUpdate) -> int | None:
    if "monthly_essential_minor" not in payload.model_fields_set:
        return None
    value = payload.monthly_essential_minor
    if value is None or value <= 0:
        return None
    return value


def _valuation(holding: AssetHolding) -> AssetValuation:
    return AssetValuation(
        holding_id=holding.id,
        owner_user_id=holding.owner_user_id,
        amount_minor=holding.amount_minor,
        as_of=holding.as_of,
    )

