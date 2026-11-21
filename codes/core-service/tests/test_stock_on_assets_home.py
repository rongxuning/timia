"""Stock account totals must appear on GET /views/me/assets."""

import secrets
import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

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
    AssetStockMark,
    AssetStockPosition,
    AssetStockTransfer,
)
from app.models.user import User
from app.services.stock_flow import quote_value_minor


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client_and_user():
    db = next(get_db())
    suffix = secrets.token_hex(4)
    user = User(
        id=uuid.uuid4(),
        email=f"stock-home-{suffix}@example.com",
        display_name=f"stock-home-{suffix}",
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


def test_stock_account_totals_appear_on_assets_home(client_and_user):
    client, headers, _db, _user = client_and_user
    created = client.post(
        "/asset-accounts",
        headers=headers,
        json={"name": "国泰君安", "account_kind": "stock", "account_number": "10443859"},
    )
    assert created.status_code == 201, created.text
    account_id = created.json()["id"]

    shares = 200
    market_price = 210_000
    cash_minor = 8_000_000
    market_value = quote_value_minor(shares, market_price, "CNY")
    expected_net = market_value + cash_minor

    opened = client.post(
        f"/asset-accounts/{account_id}/stocks",
        headers=headers,
        json={
            "symbol": "300757",
            "name": "罗博特科",
            "market": "a_share",
            "shares": shares,
            "cost_price_minor": 180_000,
            "market_price_minor": market_price,
            "reason": "建仓",
            "recorded_at": "2026-11-20T10:00:00+08:00",
        },
    )
    assert opened.status_code == 201, opened.text

    cash = client.post(
        f"/asset-accounts/{account_id}/stock-cash",
        headers=headers,
        json={
            "currency": "CNY",
            "amount_minor": cash_minor,
            "reason": "现金余额",
            "recorded_at": "2026-11-20T11:00:00+08:00",
        },
    )
    assert cash.status_code == 204, cash.text

    detail = client.get(
        f"/views/me/assets/accounts/{account_id}/stocks",
        headers=headers,
        params={
            "start": "2026-11-01",
            "end": date.today().isoformat(),
            "timezone": "Asia/Shanghai",
        },
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["flow"]["total_assets_minor"] == expected_net

    view = client.get("/views/me/assets", headers=headers)
    assert view.status_code == 200, view.text
    body = view.json()
    account = next(
        account
        for party in body["parties"]
        for account in party["accounts"]
        if account["id"] == account_id
    )
    assert account["balances"], "stock ledger must project onto homepage balances"
    assets = sum(
        row["display_minor"]
        for row in account["balances"]
        if row["kind"] == "asset" and row["include_in_net_worth"] and row["display_minor"] is not None
    )
    liabilities = sum(
        row["display_minor"]
        for row in account["balances"]
        if row["kind"] == "liability" and row["include_in_net_worth"] and row["display_minor"] is not None
    )
    assert assets == expected_net
    assert liabilities == 0
    assert account["display_minor"] == expected_net
    assert body["summary"]["total_assets_minor"] == expected_net
    assert body["summary"]["net_worth_minor"] == expected_net
    assert body["daily_series"]
    assert body["daily_series"][-1]["assets_minor"] == expected_net
    assert body["daily_series"][-1]["net_worth_minor"] == expected_net
