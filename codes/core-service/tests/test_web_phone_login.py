"""Browser phone login creates a web session and does not require a device."""

from __future__ import annotations

import uuid
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.deps import get_db
from app.main import app
from app.models._mixins import utcnow
from app.models.mobile_auth import AuthChallenge, AuthIdentity
from app.models.user import User
from app.models.web_auth import WebSession
from app.services.provider_auth import web_phone_installation_id


def test_web_phone_login_sets_refresh_cookie_without_a_device(monkeypatch):
    _allow_sms(monkeypatch)
    client = TestClient(app)
    db = next(get_db())
    user_ids: list[uuid.UUID] = []
    try:
        sent = client.post("/auth/login/phone/code", json={"phone": "13800001111"})
        assert sent.status_code == 200, sent.text
        body = sent.json()
        assert body["dev_code"]
        verified = client.post(
            "/auth/login/phone/verify",
            json={
                "phone": "13800001111",
                "code": body["dev_code"],
                "challenge_id": body["challenge_id"],
                "nonce": body["nonce"],
            },
        )
        assert verified.status_code == 200, verified.text
        assert f"{settings.web_cookie_name}=" in verified.headers["set-cookie"]
        token = verified.json()["access_token"]
        user_id = uuid.UUID(decode_access_token(token)["sub"])
        user_ids.append(user_id)
        db.expire_all()
        identity = db.scalar(select(AuthIdentity).where(AuthIdentity.user_id == user_id))
        assert identity is not None
        assert identity.provider == "phone"
        assert identity.normalized_phone == "+8613800001111"
        assert identity.phone_verified is True
        session = db.scalar(select(WebSession).where(WebSession.user_id == user_id))
        assert session is not None
        assert session.login_provider == "phone"
        user = db.get(User, user_id)
        assert user is not None
        assert user.display_name.startswith("手机")
    finally:
        _cleanup(db, user_ids)


def test_web_phone_login_is_stable(monkeypatch):
    _allow_sms(monkeypatch)
    client = TestClient(app)
    db = next(get_db())
    user_ids: list[uuid.UUID] = []
    installation = web_phone_installation_id("testclient")
    try:
        first = _login(client, "13800002222")
        user_ids.append(uuid.UUID(decode_access_token(first["access_token"])["sub"]))
        _age(db, installation)
        second = _login(client, "13800002222")
        assert decode_access_token(second["access_token"])["sub"] == str(user_ids[0])
    finally:
        _cleanup(db, user_ids)


def test_sms_bucket_uses_the_proxy_address_not_the_forwarded_prefix(monkeypatch):
    _allow_sms(monkeypatch)
    client = TestClient(app)
    db = next(get_db())
    real_ip = "203.0.113.10"
    user_ids: list[uuid.UUID] = []
    try:
        sent = client.post(
            "/auth/login/phone/code",
            json={"phone": "13800005555"},
            headers={"x-real-ip": real_ip, "x-forwarded-for": f"1.1.1.1, {real_ip}"},
        )
        assert sent.status_code == 200, sent.text
        body = sent.json()
        shared = client.post(
            "/auth/login/phone/code",
            json={"phone": "13800006666"},
            headers={"x-real-ip": real_ip, "x-forwarded-for": f"8.8.8.8, {real_ip}"},
        )
        assert shared.status_code == 200, shared.text
        verified = client.post(
            "/auth/login/phone/verify",
            json={
                "phone": "13800005555",
                "code": body["dev_code"],
                "challenge_id": body["challenge_id"],
                "nonce": body["nonce"],
            },
            headers={"x-real-ip": real_ip, "x-forwarded-for": f"9.9.9.9, {real_ip}"},
        )
        assert verified.status_code == 200, verified.text
        user_ids.append(uuid.UUID(decode_access_token(verified.json()["access_token"])["sub"]))
        db.expire_all()
        bucket = web_phone_installation_id(real_ip)
        rows = db.scalars(select(AuthChallenge).where(AuthChallenge.installation_id == bucket)).all()
        assert len(rows) == 2
        spoofed = db.scalar(
            select(AuthChallenge).where(
                AuthChallenge.installation_id == web_phone_installation_id("1.1.1.1")
            )
        )
        assert spoofed is None
        mismatched = client.post(
            "/auth/login/phone/verify",
            json={
                "phone": "13800006666",
                "code": shared.json()["dev_code"],
                "challenge_id": shared.json()["challenge_id"],
                "nonce": shared.json()["nonce"],
            },
            headers={"x-real-ip": "198.51.100.4"},
        )
        assert mismatched.status_code == 401
        assert mismatched.json()["detail"] == "invalid_challenge"
    finally:
        _cleanup(db, user_ids)


def test_wrong_code_and_resend_and_unconfigured_sms(monkeypatch):
    _allow_sms(monkeypatch)
    client = TestClient(app)
    db = next(get_db())
    try:
        sent = client.post("/auth/login/phone/code", json={"phone": "13800003333"})
        assert sent.status_code == 200, sent.text
        body = sent.json()
        wrong = "000000" if body["dev_code"] != "000000" else "111111"
        missed = client.post(
            "/auth/login/phone/verify",
            json={
                "phone": "13800003333",
                "code": wrong,
                "challenge_id": body["challenge_id"],
                "nonce": body["nonce"],
            },
        )
        assert missed.status_code == 401
        assert missed.json()["detail"] == "invalid_code"
        again = client.post("/auth/login/phone/code", json={"phone": "13800003333"})
        assert again.status_code == 429
        assert again.json()["detail"] == "resend_too_soon"

        monkeypatch.setattr(settings, "environment", "production")
        monkeypatch.setattr(settings, "sms_dev_return_code", False)
        monkeypatch.setattr(settings, "sms_provider", "")
        blocked = client.post("/auth/login/phone/code", json={"phone": "13900004444"})
        assert blocked.status_code == 503
        assert blocked.json()["detail"] == "sms_not_configured"
    finally:
        _cleanup(db, [])


def _login(client: TestClient, phone: str) -> dict:
    sent = client.post("/auth/login/phone/code", json={"phone": phone})
    assert sent.status_code == 200, sent.text
    body = sent.json()
    verified = client.post(
        "/auth/login/phone/verify",
        json={
            "phone": phone,
            "code": body["dev_code"],
            "challenge_id": body["challenge_id"],
            "nonce": body["nonce"],
        },
    )
    assert verified.status_code == 200, verified.text
    return verified.json()


def _allow_sms(monkeypatch) -> None:
    monkeypatch.setattr(settings, "environment", "development")
    monkeypatch.setattr(settings, "sms_dev_return_code", False)
    monkeypatch.setattr(settings, "sms_provider", "")


def _age(db, installation: str) -> None:
    db.execute(
        update(AuthChallenge)
        .where(AuthChallenge.installation_id == installation, AuthChallenge.purpose == "phone_code")
        .values(created_at=utcnow() - timedelta(minutes=2))
    )
    db.commit()


def _cleanup(db, user_ids: list[uuid.UUID]) -> None:
    db.rollback()
    db.execute(delete(AuthChallenge).where(AuthChallenge.installation_id.like("web:%")))
    if user_ids:
        db.execute(delete(WebSession).where(WebSession.user_id.in_(user_ids)))
        db.execute(delete(AuthIdentity).where(AuthIdentity.user_id.in_(user_ids)))
        db.execute(delete(User).where(User.id.in_(user_ids)))
    db.commit()
