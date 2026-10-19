"""HTTP tests for multi-currency asset stocktakes."""

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.deps import get_db
from app.db.session import SessionLocal
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
    AssetReferenceRate,
)
from app.services.fx_reference import store_reference_rates
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
    db.execute(delete(AssetAccount).where(AssetAccount.owner_user_id == user.id))
    db.execute(delete(AssetParty).where(AssetParty.owner_user_id == user.id))
    db.execute(delete(AssetCode).where(AssetCode.owner_user_id == user.id))
    db.execute(delete(AssetCodeCounter).where(AssetCodeCounter.owner_user_id == user.id))
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


def _open(client, headers, **overrides):
    body = {
        "party_name": "建设银行",
        "institution_kind": "bank",
        "account_name": "储蓄卡",
        "account_kind": "debit_card",
        "card_number": "6217000011112222",
        "balance_name": "人民币",
        "category": "bank_deposit",
        "currency": "CNY",
        "amount_minor": 100,
        "reason": "建账",
    }
    body.update(overrides)
    return client.post("/asset-book/open", headers=headers, json=body)


def test_assets_require_auth():
    client = TestClient(app)
    assert client.get("/views/me/assets").status_code == 401
    assert client.post("/asset-book/open", json={}).status_code == 401


def _replace_reference_rates(rates: dict[str, str]) -> list[tuple]:
    db = SessionLocal()
    snapshot = [
        (row.currency, row.cny_per_unit, row.as_of, row.fetched_at, row.source)
        for row in db.scalars(select(AssetReferenceRate)).all()
    ]
    db.execute(delete(AssetReferenceRate))
    db.commit()
    store_reference_rates(
        db,
        date(2026, 10, 16),
        {code: Decimal(value) for code, value in rates.items()},
        fetched_at=datetime(2026, 10, 16, tzinfo=timezone.utc),
    )
    db.close()
    return snapshot


def _restore_reference_rates(snapshot: list[tuple]) -> None:
    db = SessionLocal()
    db.execute(delete(AssetReferenceRate))
    db.commit()
    for currency, cny_per_unit, as_of, fetched_at, source in snapshot:
        db.add(
            AssetReferenceRate(
                currency=currency,
                cny_per_unit=cny_per_unit,
                as_of=as_of,
                fetched_at=fetched_at,
                source=source,
            )
        )
    db.commit()
    db.close()


def test_hkd_balance_is_stored_as_hkd_and_totaled_in_cny(client_and_user):
    client, headers, _user = client_and_user
    previous = _replace_reference_rates({"HKD": "0.92"})
    try:
        _assert_hkd_uses_reference_rate(client, headers)
    finally:
        _restore_reference_rates(previous)


def _assert_hkd_uses_reference_rate(client, headers):
    manual = client.put(
        "/asset-fx-rates",
        headers=headers,
        json={"currency": "HKD", "cny_per_unit": "0.50"},
    )
    assert manual.status_code == 200, manual.text

    bank = _open(
        client,
        headers,
        account_name="建行储蓄",
        card_number="6217000011110001",
        balance_name="建行储蓄",
        amount_minor=20000_00,
    )
    assert bank.status_code == 201, bank.text
    hk = _open(
        client,
        headers,
        party_name="港股券商",
        institution_kind="broker",
        account_name="港股",
        account_kind="securities",
        card_number=None,
        asset_account_no="A123456789",
        balance_name="港股",
        category="hk_share",
        currency="HKD",
        amount_minor=10000_00,
    )
    assert hk.status_code == 201, hk.text
    assert hk.json()["holding"]["currency"] == "HKD"
    assert hk.json()["holding"]["amount_minor"] == 10000_00
    assert hk.json()["holding"]["code"].startswith("A")

    view = client.get("/views/me/assets", headers=headers)
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["summary"]["display_currency"] == "CNY"
    assert body["summary"]["total_assets_minor"] == 20000_00 + 9200_00
    assert body["summary"]["emergency_cash_minor"] == 20000_00
    assert body["summary"]["investment_minor"] == 9200_00
    hk_row = next(
        balance
        for party in body["parties"]
        for account in party["accounts"]
        for balance in account["balances"]
        if balance["name"] == "港股"
    )
    assert hk_row["display_minor"] == 9200_00
    assert hk_row["amount_minor"] == 10000_00
    assert hk_row["currency"] == "HKD"
    assert hk_row["fx_missing"] is False

    missing = _open(
        client,
        headers,
        party_name="日元现金",
        institution_kind="bank",
        account_name="日元",
        account_kind="fx",
        card_number=None,
        balance_name="日元",
        category="fx",
        currency="JPY",
        amount_minor=1000,
    )
    assert missing.status_code == 201, missing.text
    again = client.get("/views/me/assets", headers=headers).json()
    assert again["summary"]["fx_incomplete"] is True
    assert "JPY" in again["summary"]["missing_currencies"]
    jpy = next(
        balance
        for party in again["parties"]
        for account in party["accounts"]
        for balance in account["balances"]
        if balance["currency"] == "JPY"
    )
    assert jpy["display_minor"] is None
    assert jpy["amount_minor"] == 1000
    quoted = next(row for row in again["rates"] if row["currency"] == "HKD")
    assert quoted["cny_per_unit"] == "0.92"
    assert quoted["source"] == "ecb"
    assert quoted["as_of"] == "2026-10-16"


def test_display_currency_switches_the_total(client_and_user):
    client, headers, _user = client_and_user
    previous = _replace_reference_rates({"USD": "7.2"})
    try:
        opened = _open(
            client,
            headers,
            party_name="美元现金",
            institution_kind="bank",
            account_name="美元",
            account_kind="fx",
            card_number=None,
            balance_name="美元",
            category="fx",
            currency="USD",
            amount_minor=10000,
        )
        assert opened.status_code == 201, opened.text
        view = client.get("/views/me/assets", headers=headers)
        assert view.status_code == 200, view.text
        body = view.json()
        assert body["summary"]["total_assets_minor"] == 72000
        switched = client.put(
            "/asset-profile",
            headers=headers,
            json={"version": body["profile"]["version"], "display_currency": "USD"},
        )
        assert switched.status_code == 200, switched.text
        again = client.get("/views/me/assets", headers=headers).json()
        assert again["summary"]["display_currency"] == "USD"
        assert again["summary"]["total_assets_minor"] == 10000
    finally:
        _restore_reference_rates(previous)


def test_adjustment_records_reason_time_and_delta(client_and_user):
    client, headers, _user = client_and_user
    created = _open(
        client,
        headers,
        party_name="招商银行",
        account_name="招商银行储蓄",
        card_number="6214830011110002",
        balance_name="招商银行储蓄",
        amount_minor=8000_00,
    )
    assert created.status_code == 201, created.text
    holding = created.json()["holding"]
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
    created = _open(
        client,
        headers,
        account_name="微信钱包",
        account_kind="wallet",
        party_name="微信支付",
        institution_kind="payment",
        card_number=None,
        balance_name="微信钱包",
        category="wallet",
        amount_minor=100,
    )
    holding_id = created.json()["holding"]["id"]
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
        "/asset-book/open",
        headers=headers,
        json={
            "party_name": "建设银行",
            "institution_kind": "bank",
            "account_name": "建行储蓄",
            "account_kind": "debit_card",
            "card_number": "6217000099990003",
            "balance_name": "建行储蓄",
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
    created = _open(
        client,
        headers,
        account_name="现金",
        account_kind="wallet",
        party_name="现金",
        institution_kind="payment",
        card_number=None,
        balance_name="现金",
        category="wallet",
        amount_minor=1,
        recorded_at=future,
    )
    assert created.status_code == 400
    assert created.json()["detail"] == "recorded_at_in_future"


def test_one_bank_many_cards_and_one_card_many_currencies(client_and_user):
    client, headers, _user = client_and_user
    first = _open(
        client,
        headers,
        party_name="建设银行",
        account_name="储蓄卡",
        card_number="6217 0000 1111 0001",
        balance_name="人民币",
        amount_minor=100_00,
    )
    assert first.status_code == 201, first.text
    second = _open(
        client,
        headers,
        party_name="建设银行",
        account_name="信用卡",
        account_kind="credit_card",
        card_number="6227 0000 2222 0002",
        balance_name="信用卡人民币",
        category="credit_card",
        amount_minor=20_00,
    )
    assert second.status_code == 201, second.text
    assert second.json()["party_code"] == first.json()["party_code"]
    assert second.json()["account_code"] != first.json()["account_code"]

    extra = _open(
        client,
        headers,
        account_id=first.json()["account_id"],
        balance_name="港币",
        currency="HKD",
        amount_minor=50_00,
    )
    assert extra.status_code == 201, extra.text
    assert extra.json()["account_code"] == first.json()["account_code"]
    assert extra.json()["holding"]["code"] != first.json()["holding"]["code"]

    duplicate = _open(
        client,
        headers,
        account_name="另一张",
        card_number="6217000011110001",
        balance_name="重复",
        amount_minor=1,
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "card_number_taken"

    view = client.get("/views/me/assets", headers=headers).json()
    bank = next(party for party in view["parties"] if party["name"] == "建设银行")
    assert len(bank["accounts"]) == 2
    savings = next(account for account in bank["accounts"] if account["card_number"] == "6217000011110001")
    assert savings["asset_account_no"] is None
    assert {row["currency"] for row in savings["balances"]} == {"CNY", "HKD"}
    assert all(row["code"].startswith("A") for row in savings["balances"])
