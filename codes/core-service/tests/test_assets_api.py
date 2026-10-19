"""HTTP tests for multi-currency asset stocktakes."""

import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.deps import get_db
from app.main import app
from app.models.asset import (
    AssetAdjustment,
    AssetExpenseAdjustment,
    AssetExpenseItem,
    AssetFxRate,
    AssetHolding,
    AssetProfile,
)
from app.models.user import User


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, suffix: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"assets-{suffix}@example.com",
        display_name=f"assets-{suffix}",
        password_hash=hash_password("password123!"),
        status="active",
        system_role="user",
    )
    db.add(user)
    db.commit()
    return user


def _cleanup(db, user: User) -> None:
    db.execute(delete(AssetAdjustment).where(AssetAdjustment.owner_user_id == user.id))
    db.execute(delete(AssetExpenseAdjustment).where(AssetExpenseAdjustment.owner_user_id == user.id))
    db.execute(delete(AssetHolding).where(AssetHolding.owner_user_id == user.id))
    db.execute(delete(AssetExpenseItem).where(AssetExpenseItem.owner_user_id == user.id))
    db.execute(delete(AssetFxRate).where(AssetFxRate.owner_user_id == user.id))
    db.execute(delete(AssetProfile).where(AssetProfile.owner_user_id == user.id))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()


@pytest.fixture
def client_and_user():
    db = next(get_db())
    suffix = secrets.token_hex(4)
    user = _make_user(db, suffix)
    token = create_access_token(subject=str(user.id), audience=settings.jwt_audience)
    client = TestClient(app)
    try:
        yield client, _headers(token), user
    finally:
        _cleanup(db, user)
        db.close()


def test_assets_require_auth():
    client = TestClient(app)
    assert client.get("/views/me/assets").status_code == 401
    assert client.post("/asset-holdings", json={}).status_code == 401


def test_hkd_balance_is_stored_as_hkd_and_totaled_in_cny(client_and_user):
    client, headers, _user = client_and_user
    rate = client.put(
        "/asset-fx-rates",
        headers=headers,
        json={"currency": "HKD", "cny_per_unit": "0.92"},
    )
    assert rate.status_code == 200, rate.text
    assert rate.json()["cny_per_unit"] == "0.92"

    bank = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "建行储蓄",
            "kind": "asset",
            "category": "bank_deposit",
            "currency": "CNY",
            "amount_minor": 20000_00,
            "reason": "建账",
        },
    )
    assert bank.status_code == 201, bank.text
    hk = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "港股",
            "kind": "asset",
            "category": "hk_share",
            "currency": "HKD",
            "amount_minor": 10000_00,
            "reason": "建账",
        },
    )
    assert hk.status_code == 201, hk.text
    assert hk.json()["currency"] == "HKD"
    assert hk.json()["amount_minor"] == 10000_00

    view = client.get("/views/me/assets", headers=headers)
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["summary"]["display_currency"] == "CNY"
    assert body["summary"]["total_assets_minor"] == 20000_00 + 9200_00
    assert body["summary"]["emergency_cash_minor"] == 20000_00
    assert body["summary"]["investment_minor"] == 9200_00
    hk_row = next(row for group in body["groups"] for row in group["holdings"] if row["name"] == "港股")
    assert hk_row["display_minor"] == 9200_00
    assert hk_row["amount_minor"] == 10000_00
    assert hk_row["currency"] == "HKD"
    assert hk_row["fx_missing"] is False

    missing = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "日元",
            "kind": "asset",
            "category": "fx",
            "currency": "JPY",
            "amount_minor": 1000,
            "reason": "建账",
        },
    )
    assert missing.status_code == 201, missing.text
    again = client.get("/views/me/assets", headers=headers).json()
    assert again["summary"]["fx_incomplete"] is True
    assert "JPY" in again["summary"]["missing_currencies"]
    jpy = next(row for group in again["groups"] for row in group["holdings"] if row["currency"] == "JPY")
    assert jpy["display_minor"] is None
    assert jpy["amount_minor"] == 1000


def test_adjustment_records_reason_time_and_delta(client_and_user):
    client, headers, _user = client_and_user
    created = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "招商银行储蓄",
            "kind": "asset",
            "category": "bank_deposit",
            "currency": "CNY",
            "amount_minor": 8000_00,
            "reason": "建账",
        },
    )
    assert created.status_code == 201, created.text
    holding = created.json()
    when = datetime.now(timezone.utc).isoformat()
    adjusted = client.post(
        f"/asset-holdings/{holding['id']}/adjustments",
        headers=headers,
        json={
            "version": holding["version"],
            "amount_minor": 5000_00,
            "reason": "取出生活费",
            "recorded_at": when,
        },
    )
    assert adjusted.status_code == 200, adjusted.text
    assert adjusted.json()["amount_minor"] == 5000_00
    assert adjusted.json()["latest_reason"] == "取出生活费"

    detail = client.get(f"/asset-holdings/{holding['id']}", headers=headers)
    assert detail.status_code == 200, detail.text
    history = detail.json()["adjustments"]
    assert history[0]["reason"] == "取出生活费"
    assert history[0]["delta_minor"] == -3000_00
    assert history[0]["amount_minor"] == 5000_00
    assert history[1]["reason"] == "建账"
    assert history[1]["delta_minor"] == 8000_00


def test_other_user_cannot_see_a_holding(client_and_user):
    client, headers, _user = client_and_user
    created = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "微信钱包",
            "kind": "asset",
            "category": "wallet",
            "currency": "CNY",
            "amount_minor": 100,
            "reason": "建账",
        },
    )
    holding_id = created.json()["id"]
    db = next(get_db())
    other = _make_user(db, secrets.token_hex(4))
    other_headers = _headers(
        create_access_token(subject=str(other.id), audience=settings.jwt_audience)
    )
    try:
        hidden = client.get(f"/asset-holdings/{holding_id}", headers=other_headers)
        assert hidden.status_code == 404
    finally:
        _cleanup(db, other)
        db.close()


def test_expense_reserve_is_separate_from_monthly_cover(client_and_user):
    client, headers, _user = client_and_user
    for name, group, amount in (
        ("住房", "fixed", 3000_00),
        ("吃饭", "daily", 1500_00),
        ("应急", "emergency", 10000_00),
    ):
        created = client.post(
            "/asset-expenses",
            headers=headers,
            json={
                "name": name,
                "group_kind": group,
                "currency": "CNY",
                "amount_minor": amount,
                "reason": "建账",
            },
        )
        assert created.status_code == 201, created.text
    client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "建行储蓄",
            "kind": "asset",
            "category": "bank_deposit",
            "currency": "CNY",
            "amount_minor": 9000_00,
            "reason": "建账",
        },
    )
    view = client.get("/views/me/assets", headers=headers).json()
    assert view["summary"]["monthly_running_minor"] == 4500_00
    assert view["summary"]["emergency_reserve_minor"] == 10000_00
    assert view["summary"]["coverage_months"] == 2.0
    groups = {row["group_kind"]: row["display_minor"] for row in view["expense_groups"]}
    assert groups["fixed"] == 3000_00
    assert groups["emergency"] == 10000_00


def test_future_adjustment_is_rejected(client_and_user):
    client, headers, _user = client_and_user
    future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    created = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "现金",
            "kind": "asset",
            "category": "wallet",
            "currency": "CNY",
            "amount_minor": 1,
            "reason": "建账",
            "recorded_at": future,
        },
    )
    assert created.status_code == 400
    assert created.json()["detail"] == "recorded_at_in_future"
