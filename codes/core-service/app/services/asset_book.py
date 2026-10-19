"""Institution → account → currency balance.

同一开户机构下可以有多张卡或资产账号。同一张卡或同一个资产账号下，
每种分类加币种只有一条余额。编号在整本账里唯一。
"""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import (
    AssetAccount,
    AssetAdjustment,
    AssetCode,
    AssetCodeCounter,
    AssetHolding,
    AssetParty,
)
from app.models.user import User
from app.schemas.asset import AssetBookOpen, AssetBookOpenOut, AssetHoldingCreate, AssetHoldingOut
from app.services.asset_api import _ensure_profile, _holding_out, _moment, utcnow
from app.services.assets_math import (
    ASSET_CATEGORIES,
    LIABILITY_CATEGORIES,
    LIABILITY_KIND,
    ASSET_KIND,
)

ACCOUNT_CATEGORIES: dict[str, frozenset[str]] = {
    "debit_card": frozenset({"bank_deposit"}),
    "credit_card": frozenset({"credit_card"}),
    "securities": frozenset({"a_share", "hk_share", "bank_deposit"}),
    "wallet": frozenset({"wallet"}),
    "housing_fund": frozenset({"housing_fund"}),
    "medical": frozenset({"medical"}),
    "gold": frozenset({"gold"}),
    "fx": frozenset({"fx"}),
    "other": ASSET_CATEGORIES | LIABILITY_CATEGORIES,
}

INSTITUTION_FOR_ACCOUNT = {
    "debit_card": "bank",
    "credit_card": "bank",
    "securities": "broker",
    "wallet": "payment",
    "housing_fund": "agency",
    "medical": "agency",
    "gold": "other",
    "fx": "bank",
    "other": "other",
}


def open_book(db: Session, user: User, payload: AssetBookOpen) -> AssetBookOpenOut:
    _ensure_profile(db, user.id)
    moment = _moment(payload.recorded_at)
    if payload.account_id:
        account = _owned_account(db, user.id, uuid.UUID(payload.account_id))
        party = _owned_party(db, user.id, account.party_id)
    else:
        if not payload.account_kind or not payload.account_name:
            raise HTTPException(status_code=400, detail="account_required")
        party = _resolve_party(db, user, payload)
        account = _create_account(db, user, party, payload)
    holding = _insert_balance(
        db,
        user,
        account,
        name=payload.balance_name or payload.account_name or payload.currency,
        category=payload.category,
        currency=payload.currency,
        amount_minor=payload.amount_minor,
        include_in_net_worth=payload.include_in_net_worth,
        reason=payload.reason,
        moment=moment,
        note=None,
    )
    db.commit()
    db.refresh(holding)
    return AssetBookOpenOut(
        party_id=str(party.id),
        party_code=party.code,
        account_id=str(account.id),
        account_code=account.code,
        holding=_holding_out(holding, payload.reason, utcnow().date()),
    )


def add_balance(db: Session, user: User, payload: AssetHoldingCreate) -> AssetHoldingOut:
    _ensure_profile(db, user.id)
    moment = _moment(payload.recorded_at)
    account = _owned_account(db, user.id, uuid.UUID(payload.account_id))
    holding = _insert_balance(
        db,
        user,
        account,
        name=payload.name,
        category=payload.category,
        currency=payload.currency,
        amount_minor=payload.amount_minor,
        include_in_net_worth=payload.include_in_net_worth,
        reason=payload.reason,
        moment=moment,
        note=payload.note,
    )
    db.commit()
    db.refresh(holding)
    return _holding_out(holding, payload.reason, utcnow().date())


def list_parties(db: Session, user_id: uuid.UUID) -> list[AssetParty]:
    return list(
        db.scalars(
            select(AssetParty).where(
                AssetParty.owner_user_id == user_id,
                AssetParty.archived_at.is_(None),
            )
        ).all()
    )


def list_accounts(db: Session, user_id: uuid.UUID) -> list[AssetAccount]:
    return list(
        db.scalars(
            select(AssetAccount).where(
                AssetAccount.owner_user_id == user_id,
                AssetAccount.archived_at.is_(None),
            )
        ).all()
    )


def _resolve_party(db: Session, user: User, payload: AssetBookOpen) -> AssetParty:
    if payload.party_id:
        return _owned_party(db, user.id, uuid.UUID(payload.party_id))
    if not payload.party_name or not payload.account_kind:
        raise HTTPException(status_code=400, detail="party_required")
    expected = INSTITUTION_FOR_ACCOUNT[payload.account_kind]
    kind = payload.institution_kind or expected
    if payload.account_kind != "other" and kind != expected:
        raise HTTPException(status_code=400, detail="institution_kind_mismatch")
    existing = db.scalar(
        select(AssetParty).where(
            AssetParty.owner_user_id == user.id,
            AssetParty.name == payload.party_name,
            AssetParty.institution_kind == kind,
            AssetParty.archived_at.is_(None),
        )
    )
    if existing is not None:
        return existing
    party = AssetParty(
        owner_user_id=user.id,
        code=_allocate_code(db, user.id),
        name=payload.party_name,
        institution_kind=kind,
        version=1,
    )
    db.add(party)
    db.flush()
    return party


def _create_account(
    db: Session, user: User, party: AssetParty, payload: AssetBookOpen
) -> AssetAccount:
    kind = payload.account_kind or ""
    card = _normalize_card(payload.card_number, required=kind in {"debit_card", "credit_card"})
    asset_no = _normalize_code(
        payload.asset_account_no,
        required=kind == "securities",
        missing="asset_account_no_required",
    )
    account_no = _normalize_code(payload.account_number, required=False, missing="account_no_invalid")
    if card and _number_taken(db, user.id, AssetAccount.card_number, card):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="card_number_taken")
    if asset_no and _number_taken(db, user.id, AssetAccount.asset_account_no, asset_no):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="asset_account_no_taken")
    account = AssetAccount(
        owner_user_id=user.id,
        party_id=party.id,
        code=_allocate_code(db, user.id),
        name=payload.account_name or payload.balance_name,
        account_kind=kind,
        card_number=card,
        asset_account_no=asset_no,
        account_number=account_no,
        version=1,
    )
    db.add(account)
    db.flush()
    return account


def _insert_balance(
    db: Session,
    user: User,
    account: AssetAccount,
    *,
    name: str,
    category: str,
    currency: str,
    amount_minor: int,
    include_in_net_worth: bool,
    reason: str,
    moment,
    note: str | None,
) -> AssetHolding:
    allowed = ACCOUNT_CATEGORIES.get(account.account_kind, frozenset())
    if category not in allowed:
        raise HTTPException(status_code=400, detail="category_not_allowed")
    kind = LIABILITY_KIND if category in LIABILITY_CATEGORIES else ASSET_KIND
    existing = db.scalar(
        select(AssetHolding.id).where(
            AssetHolding.account_id == account.id,
            AssetHolding.category == category,
            AssetHolding.currency == currency,
            AssetHolding.archived_at.is_(None),
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="balance_exists")
    holding = AssetHolding(
        owner_user_id=user.id,
        account_id=account.id,
        code=_allocate_code(db, user.id),
        name=name,
        kind=kind,
        category=category,
        currency=currency,
        amount_minor=amount_minor,
        institution=None,
        note=note,
        adjusted_at=moment,
        include_in_net_worth=include_in_net_worth,
        version=1,
    )
    db.add(holding)
    db.flush()
    db.add(
        AssetAdjustment(
            holding_id=holding.id,
            owner_user_id=user.id,
            amount_minor=amount_minor,
            delta_minor=amount_minor,
            reason=reason,
            recorded_at=moment,
        )
    )
    db.flush()
    return holding


def _allocate_code(db: Session, user_id: uuid.UUID) -> str:
    counter = db.scalar(
        select(AssetCodeCounter).where(AssetCodeCounter.owner_user_id == user_id).with_for_update()
    )
    if counter is None:
        counter = AssetCodeCounter(owner_user_id=user_id, next_value=1)
        db.add(counter)
        db.flush()
    code = f"A{counter.next_value:06d}"
    counter.next_value += 1
    db.add(counter)
    db.add(AssetCode(owner_user_id=user_id, code=code))
    db.flush()
    return code


def _owned_party(db: Session, user_id: uuid.UUID, party_id: uuid.UUID) -> AssetParty:
    row = db.get(AssetParty, party_id)
    if row is None or row.owner_user_id != user_id or row.archived_at is not None:
        raise HTTPException(status_code=404, detail="not_found")
    return row


def _owned_account(db: Session, user_id: uuid.UUID, account_id: uuid.UUID) -> AssetAccount:
    row = db.get(AssetAccount, account_id)
    if row is None or row.owner_user_id != user_id or row.archived_at is not None:
        raise HTTPException(status_code=404, detail="not_found")
    return row


def _normalize_card(value: str | None, *, required: bool) -> str | None:
    if not value:
        if required:
            raise HTTPException(status_code=400, detail="card_number_required")
        return None
    digits = "".join(ch for ch in value if ch.isdigit())
    if not 8 <= len(digits) <= 30:
        raise HTTPException(status_code=400, detail="card_number_invalid")
    return digits


def _normalize_code(value: str | None, *, required: bool, missing: str) -> str | None:
    if not value:
        if required:
            raise HTTPException(status_code=400, detail=missing)
        return None
    text = "".join(value.split()).upper()
    if not 4 <= len(text) <= 40:
        raise HTTPException(status_code=400, detail="account_no_invalid")
    return text


def _number_taken(db: Session, user_id: uuid.UUID, column, value: str) -> bool:
    found = db.scalar(
        select(AssetAccount.id).where(
            AssetAccount.owner_user_id == user_id,
            column == value,
            AssetAccount.archived_at.is_(None),
        )
    )
    return found is not None
