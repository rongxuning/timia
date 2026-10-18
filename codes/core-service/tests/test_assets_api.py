"""HTTP tests for the personal asset ledger."""

import secrets
import uuid
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.deps import get_db
from app.main import app
from app.models.asset import AssetHolding, AssetProfile, AssetValuation
from app.models.user import User
from app.services.asset_api import utc_today


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
    db.execute(delete(AssetValuation).where(AssetValuation.owner_user_id == user.id))
    db.execute(delete(AssetHolding).where(AssetHolding.owner_user_id == user.id))
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


def test_stocktake_rolls_into_net_worth(client_and_user):
    client, headers, _user = client_and_user
    today = utc_today().isoformat()
    cash = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "工资卡",
            "kind": "asset",
            "category": "cash",
            "amount_minor": 20000_00,
            "institution": "招商银行",
            "as_of": today,
        },
    )
    assert cash.status_code == 201, cash.text
    card = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "信用卡",
            "kind": "liability",
            "category": "credit",
            "amount_minor": 3000_00,
            "as_of": today,
        },
    )
    assert card.status_code == 201, card.text

    view = client.get("/views/me/assets", headers=headers)
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["summary"]["net_worth_minor"] == 17000_00
    assert body["summary"]["liquid_net_worth_minor"] == 17000_00
    assert body["summary"]["focus"] == "high_interest"
    assert body["profile"]["currency"] == "CNY"
    assert body["profile"]["currency_locked"] is True
    assert len(body["net_worth_series"]) == 1

    locked = client.put(
        "/asset-profile",
        headers=headers,
        json={"version": body["profile"]["version"], "currency": "USD"},
    )
    assert locked.status_code == 400
    assert locked.json()["detail"] == "currency_has_holdings"


def test_other_user_holding_is_hidden(client_and_user):
    client, headers, _user = client_and_user
    created = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "现金",
            "kind": "asset",
            "category": "cash",
            "amount_minor": 100,
            "as_of": utc_today().isoformat(),
        },
    )
    holding_id = created.json()["id"]

    db = next(get_db())
    other = _make_user(db, secrets.token_hex(4))
    other_headers = _headers(
        create_access_token(subject=str(other.id), audience=settings.jwt_audience)
    )
    try:
        hidden = client.patch(
            f"/asset-holdings/{holding_id}",
            headers=other_headers,
            json={"version": 1, "amount_minor": 1},
        )
        assert hidden.status_code == 404
        assert hidden.json()["detail"] == "not_found"
    finally:
        _cleanup(db, other)
        db.close()


def test_version_conflict_confirm_and_archive(client_and_user):
    client, headers, _user = client_and_user
    created = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "基金",
            "kind": "asset",
            "category": "investment",
            "amount_minor": 5000,
            "as_of": "2026-01-01",
        },
    )
    assert created.status_code == 201, created.text
    holding = created.json()
    stale = client.patch(
        f"/asset-holdings/{holding['id']}",
        headers=headers,
        json={"version": holding["version"] + 1, "amount_minor": 1},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"] == "version_conflict"

    confirmed = client.post(
        f"/asset-holdings/{holding['id']}/confirm",
        headers=headers,
        json={"version": holding["version"], "as_of": utc_today().isoformat()},
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["as_of"] == utc_today().isoformat()
    assert confirmed.json()["needs_review"] is False

    archived = client.post(
        f"/asset-holdings/{holding['id']}/archive",
        headers=headers,
        json={"version": confirmed.json()["version"]},
    )
    assert archived.status_code == 204
    view = client.get("/views/me/assets", headers=headers)
    assert view.json()["summary"]["holding_count"] == 0


def test_future_stocktake_date_is_rejected(client_and_user):
    client, headers, _user = client_and_user
    future = (utc_today() + timedelta(days=3)).isoformat()
    created = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "现金",
            "kind": "asset",
            "category": "cash",
            "amount_minor": 1,
            "as_of": future,
        },
    )
    assert created.status_code == 400
    assert created.json()["detail"] == "as_of_in_future"


def test_profile_sets_emergency_months(client_and_user):
    client, headers, _user = client_and_user
    saved = client.put(
        "/asset-profile",
        headers=headers,
        json={"version": 0, "monthly_essential_minor": 10000_00},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 1
    created = client.post(
        "/asset-holdings",
        headers=headers,
        json={
            "name": "活期",
            "kind": "asset",
            "category": "cash",
            "amount_minor": 30000_00,
            "as_of": utc_today().isoformat(),
        },
    )
    assert created.status_code == 201, created.text
    view = client.get("/views/me/assets", headers=headers)
    summary = view.json()["summary"]
    assert summary["emergency_months"] == 3.0
    assert summary["emergency_band"] == "adequate"
    assert summary["focus"] == "balanced"
