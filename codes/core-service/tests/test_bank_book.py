"""Bank account products: savings, investment, credit."""

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
    AssetBankCreditBill,
    AssetBankInvestmentOp,
    AssetBankProduct,
    AssetBankSavingsTxn,
    AssetCode,
    AssetCodeCounter,
    AssetExpenseAdjustment,
    AssetExpenseItem,
    AssetFxRate,
    AssetHolding,
    AssetParty,
    AssetProfile,
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
        email=f"bank-{suffix}@example.com",
        display_name=f"bank-{suffix}",
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
        db.execute(delete(AssetBankSavingsTxn).where(AssetBankSavingsTxn.owner_user_id == user.id))
        db.execute(delete(AssetBankInvestmentOp).where(AssetBankInvestmentOp.owner_user_id == user.id))
        db.execute(delete(AssetBankCreditBill).where(AssetBankCreditBill.owner_user_id == user.id))
        db.execute(delete(AssetBankProduct).where(AssetBankProduct.owner_user_id == user.id))
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


def _account(client, headers, number: str = "BANK0001") -> str:
    created = client.post(
        "/asset-accounts",
        headers=headers,
        json={"name": "建设银行", "account_kind": "savings", "account_number": number},
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_bank_detail_requires_auth():
    client = TestClient(app)
    assert client.get("/views/me/assets/accounts/00000000-0000-0000-0000-000000000001/bank").status_code == 401


def test_savings_product_same_day_collapses_and_detail_series(client_and_user):
    client, headers, db, _user = client_and_user
    account_id = _account(client, headers)
    created = client.post(
        f"/asset-accounts/{account_id}/bank-products",
        headers=headers,
        json={
            "name": "活期",
            "product_kind": "savings",
            "balance_minor": 100_00,
            "reason": "开户",
            "recorded_at": "2026-11-20T10:00:00+08:00",
        },
    )
    assert created.status_code == 201, created.text
    product = created.json()
    assert product["balance_minor"] == 100_00

    updated = client.post(
        f"/asset-accounts/{account_id}/bank-products/{product['id']}/savings-txns",
        headers=headers,
        json={
            "version": product["version"],
            "balance_minor": 150_00,
            "reason": "发工资",
            "recorded_at": "2026-11-20T18:00:00+08:00",
            "timezone": "Asia/Shanghai",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["balance_minor"] == 150_00
    assert updated.json()["version"] == product["version"] + 1
    db.expire_all()
    count = db.scalar(
        select(func.count()).select_from(AssetBankSavingsTxn).where(
            AssetBankSavingsTxn.product_id == uuid.UUID(product["id"])
        )
    )
    assert count == 1

    next_day = client.post(
        f"/asset-accounts/{account_id}/bank-products/{product['id']}/savings-txns",
        headers=headers,
        json={
            "version": updated.json()["version"],
            "balance_minor": 180_00,
            "reason": "转入",
            "recorded_at": "2026-11-21T09:00:00+08:00",
            "timezone": "Asia/Shanghai",
        },
    )
    assert next_day.status_code == 200, next_day.text

    detail = client.get(
        f"/views/me/assets/accounts/{account_id}/bank",
        headers=headers,
        params={
            "start": "2026-11-19",
            "end": "2026-11-21",
            "timezone": "Asia/Shanghai",
            "product_id": product["id"],
        },
    )
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["summary"]["total_assets_minor"] == 180_00
    assert len(body["products"]) == 1
    assert body["products"][0]["product_kind"] == "savings"
    assert body["series"][-1]["total_assets_minor"] == 180_00
    assert body["selected"]["product"]["balance_minor"] == 180_00
    assert len(body["selected"]["savings_txns"]) >= 1
    assert body["selected"]["series"][-1]["primary_minor"] == 180_00


def test_investment_and_credit_products(client_and_user):
    client, headers, db, _user = client_and_user
    account_id = _account(client, headers, "BANK0002")

    investment = client.post(
        f"/asset-accounts/{account_id}/bank-products",
        headers=headers,
        json={
            "name": "理财A",
            "product_kind": "investment",
            "value_minor": 200_00,
            "cost_minor": 180_00,
            "reason": "买入",
            "recorded_at": "2026-11-01T10:00:00+08:00",
        },
    )
    assert investment.status_code == 201, investment.text
    inv = investment.json()
    assert inv["value_minor"] == 200_00
    assert inv["cost_minor"] == 180_00

    mark = client.post(
        f"/asset-accounts/{account_id}/bank-products/{inv['id']}/investment-ops",
        headers=headers,
        json={
            "version": inv["version"],
            "value_minor": 220_00,
            "cost_minor": 200_00,
            "reason": "加仓",
            "recorded_at": "2026-11-15T10:00:00+08:00",
            "timezone": "Asia/Shanghai",
        },
    )
    assert mark.status_code == 200, mark.text
    assert mark.json()["cost_minor"] == 200_00

    credit = client.post(
        f"/asset-accounts/{account_id}/bank-products",
        headers=headers,
        json={
            "name": "信用卡",
            "product_kind": "credit",
            "limit_minor": 50_000_00,
            "statement_minor": 3_200_00,
            "paid_off": False,
            "reason": "本月账单",
            "recorded_at": "2026-11-10T10:00:00+08:00",
        },
    )
    assert credit.status_code == 201, credit.text
    card = credit.json()
    assert card["paid_off"] is False

    bill = client.post(
        f"/asset-accounts/{account_id}/bank-products/{card['id']}/credit-bills",
        headers=headers,
        json={
            "version": card["version"],
            "year_month": "2026-11",
            "limit_minor": 50_000_00,
            "statement_minor": 0,
            "paid_off": True,
            "reason": "还清",
            "recorded_at": "2026-11-20T10:00:00+08:00",
        },
    )
    assert bill.status_code == 200, bill.text
    assert bill.json()["paid_off"] is True
    assert bill.json()["statement_minor"] == 0

    detail = client.get(
        f"/views/me/assets/accounts/{account_id}/bank",
        headers=headers,
        params={
            "start": "2026-11-01",
            "end": "2026-11-21",
            "timezone": "Asia/Shanghai",
            "product_id": inv["id"],
        },
    )
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["summary"]["total_assets_minor"] == 220_00
    assert body["selected"]["investment_ops"][0]["cost_delta_minor"] == 20_00
    kinds = {row["product_kind"] for row in body["products"]}
    assert kinds == {"investment", "credit"}

    credit_detail = client.get(
        f"/views/me/assets/accounts/{account_id}/bank",
        headers=headers,
        params={
            "start": "2026-11-01",
            "end": "2026-11-21",
            "timezone": "Asia/Shanghai",
            "product_id": card["id"],
        },
    )
    assert credit_detail.status_code == 200, credit_detail.text
    assert credit_detail.json()["selected"]["credit_bills"][0]["paid_off"] is True


def test_stock_account_rejected_for_bank_products(client_and_user):
    client, headers, _db, _user = client_and_user
    created = client.post(
        "/asset-accounts",
        headers=headers,
        json={"name": "券商", "account_kind": "stock", "account_number": "STOCK99"},
    )
    assert created.status_code == 201
    account_id = created.json()["id"]
    bad = client.post(
        f"/asset-accounts/{account_id}/bank-products",
        headers=headers,
        json={
            "name": "活期",
            "product_kind": "savings",
            "balance_minor": 1,
            "reason": "开户",
        },
    )
    assert bad.status_code == 400
    assert bad.json()["detail"] == "account_not_bank"
