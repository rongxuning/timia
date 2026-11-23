"""A price update replaces the mark already stored on that local day."""

import secrets
import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.deps import get_db
from app.main import app
from app.models.asset import (
    AssetAccount,
    AssetAdjustment,
    AssetCode,
    AssetCodeCounter,
    AssetExpenseAdjustment,
    AssetExpenseItem,
    AssetFxRate,
    AssetHolding,
    AssetParty,
    AssetProfile,
    AssetStockCash,
    AssetStockFrozen,
    AssetStockMark,
    AssetStockPosition,
    AssetStockTransfer,
)
from app.models.user import User


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client_and_user():
    db = next(get_db())
    suffix = secrets.token_hex(4)
    user = User(
        id=uuid.uuid4(),
        email=f"stocks-{suffix}@example.com",
        display_name=f"stocks-{suffix}",
        password_hash=hash_password("password123!"),
        status="active",
        system_role="user",
    )
    db.add(user)
    db.commit()
    token = create_access_token(subject=str(user.id), audience=settings.jwt_audience)
    client = TestClient(app)
    try:
        yield client, _headers(token), db, user
    finally:
        db.execute(delete(AssetStockMark).where(AssetStockMark.owner_user_id == user.id))
        db.execute(delete(AssetStockCash).where(AssetStockCash.owner_user_id == user.id))
        db.execute(delete(AssetStockFrozen).where(AssetStockFrozen.owner_user_id == user.id))
        db.execute(delete(AssetStockTransfer).where(AssetStockTransfer.owner_user_id == user.id))
        db.execute(delete(AssetStockPosition).where(AssetStockPosition.owner_user_id == user.id))
        db.execute(delete(AssetAdjustment).where(AssetAdjustment.owner_user_id == user.id))
        db.execute(delete(AssetExpenseAdjustment).where(AssetExpenseAdjustment.owner_user_id == user.id))
        db.execute(delete(AssetHolding).where(AssetHolding.owner_user_id == user.id))
        db.execute(delete(AssetAccount).where(AssetAccount.owner_user_id == user.id))
        db.execute(delete(AssetParty).where(AssetParty.owner_user_id == user.id))
        db.execute(delete(AssetCode).where(AssetCode.owner_user_id == user.id))
        db.execute(delete(AssetCodeCounter).where(AssetCodeCounter.owner_user_id == user.id))
        db.execute(delete(AssetExpenseItem).where(AssetExpenseItem.owner_user_id == user.id))
        db.execute(delete(AssetFxRate).where(AssetFxRate.owner_user_id == user.id))
        db.execute(delete(AssetProfile).where(AssetProfile.owner_user_id == user.id))
        db.execute(delete(User).where(User.id == user.id))
        db.commit()
        db.close()


def _account(client, headers, number: str) -> str:
    created = client.post(
        "/asset-accounts",
        headers=headers,
        json={"name": "国泰君安", "account_kind": "stock", "account_number": number},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def _open(client, headers, account_id: str, *, when: str, price: int) -> dict:
    created = client.post(
        f"/asset-accounts/{account_id}/stocks",
        headers=headers,
        json={
            "symbol": "300757",
            "name": "罗博特科",
            "market": "a_share",
            "shares": 3100,
            "cost_price_minor": 200819,
            "market_price_minor": price,
            "reason": "建仓",
            "recorded_at": when,
        },
    )
    assert created.status_code == 201, created.text
    return created.json()


def _mark(client, headers, account_id: str, position: dict, *, when: str, price: int, zone: str | None):
    body = {
        "version": position["version"],
        "shares": 3100,
        "cost_price_minor": 200819,
        "market_price_minor": price,
        "reason": "更新价格",
        "recorded_at": when,
    }
    if zone is not None:
        body["timezone"] = zone
    updated = client.post(
        f"/asset-accounts/{account_id}/stocks/{position['id']}/marks",
        headers=headers,
        json=body,
    )
    return updated


def _count(db, position_id: str) -> int:
    db.expire_all()
    return db.scalar(
        select(func.count()).select_from(AssetStockMark).where(
            AssetStockMark.position_id == uuid.UUID(position_id)
        )
    )


def test_same_local_day_replaces_the_mark_and_a_new_day_inserts(client_and_user):
    client, headers, db, _user = client_and_user
    account_id = _account(client, headers, "BROKER21")
    position = _open(client, headers, account_id, when="2026-11-21T10:00:00+08:00", price=200819)
    updated = _mark(
        client,
        headers,
        account_id,
        position,
        when="2026-11-21T22:17:00+08:00",
        price=202050,
        zone="Asia/Shanghai",
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["market_price_minor"] == 202050
    assert updated.json()["version"] == position["version"] + 1
    assert _count(db, position["id"]) == 1
    db.expire_all()
    row = db.scalar(select(AssetStockMark).where(AssetStockMark.position_id == uuid.UUID(position["id"])))
    assert row is not None
    assert row.market_price_minor == 202050
    assert row.reason == "更新价格"
    assert row.recorded_at == datetime(2026, 11, 21, 14, 17, tzinfo=timezone.utc)

    nxt = _mark(
        client,
        headers,
        account_id,
        updated.json(),
        when="2026-11-22T09:00:00+08:00",
        price=203000,
        zone="Asia/Shanghai",
    )
    assert nxt.status_code == 200, nxt.text
    assert _count(db, position["id"]) == 2


def test_shanghai_day_is_not_the_utc_date(client_and_user):
    client, headers, db, _user = client_and_user
    account_id = _account(client, headers, "BROKER22")
    position = _open(client, headers, account_id, when="2026-11-21T10:00:00+08:00", price=200819)
    # 16:30Z on the 20th is 00:30 on the 21st in Shanghai, so it replaces that day.
    updated = _mark(
        client,
        headers,
        account_id,
        position,
        when="2026-11-20T16:30:00Z",
        price=201000,
        zone="Asia/Shanghai",
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["market_price_minor"] == 201000
    assert _count(db, position["id"]) == 1


def test_mark_rejects_an_unknown_timezone(client_and_user):
    client, headers, _db, _user = client_and_user
    account_id = _account(client, headers, "BROKER23")
    position = _open(client, headers, account_id, when="2026-11-21T10:00:00+08:00", price=200819)
    updated = _mark(
        client,
        headers,
        account_id,
        position,
        when="2026-11-21T22:17:00+08:00",
        price=202050,
        zone="Not/AZone",
    )
    assert updated.status_code == 400
    assert updated.json()["detail"] == "timezone_invalid"
