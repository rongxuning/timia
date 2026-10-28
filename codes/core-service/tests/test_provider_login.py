"""Phone login, OAuth gates, and account link/merge."""

from __future__ import annotations

import base64
import uuid
from datetime import timedelta
from types import SimpleNamespace

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, update

from app.core.config import settings
from app.core.security import decode_access_token, hash_password
from app.db.deps import get_db
from app.main import app
from app.models._mixins import utcnow
from app.models.item import Item
from app.models.mobile_auth import AuthChallenge, AuthIdentity, MobileDevice
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services.account_merge import merge_accounts, pick_survivor
from app.services.mobile_auth import (
    oauth_login_message,
    phone_login_message,
    registration_message,
)
from app.services.phone_numbers import mask_phone, normalize_phone


def test_normalize_and_mask_chinese_mobile():
    assert normalize_phone("138 1234-5678") == "+8613812345678"
    assert normalize_phone("+86 13812345678") == "+8613812345678"
    assert mask_phone("+8613812345678") == "138****5678"


def test_pick_survivor_keeps_earlier_account():
    older = SimpleNamespace(
        id=uuid.UUID(int=1),
        created_at=utcnow() - timedelta(days=3),
    )
    newer = SimpleNamespace(id=uuid.UUID(int=2), created_at=utcnow())
    survivor, loser = pick_survivor(older, newer)
    assert survivor is older
    assert loser is newer

    same_time = utcnow()
    first = SimpleNamespace(id=uuid.UUID(int=1), created_at=same_time)
    second = SimpleNamespace(id=uuid.UUID(int=2), created_at=same_time)
    survivor, loser = pick_survivor(second, first)
    assert survivor is first
    assert loser is second


def test_oauth_callback_redirects_into_the_app():
    client = TestClient(app, follow_redirects=False)
    response = client.get(
        "/auth/mobile/oauth/wechat/callback",
        params={"code": "abc", "state": "state-1"},
    )
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("timia://oauth/wechat?")
    assert "code=abc" in location
    assert "state=state-1" in location

    missing = client.get("/auth/mobile/oauth/apple/callback")
    assert missing.status_code == 404


def test_phone_code_locks_after_five_misses(monkeypatch):
    monkeypatch.setattr(settings, "sms_provider", "")
    client = TestClient(app)
    installation, private_key = _register_device(client)
    db = next(get_db())
    try:
        sent = _send_code(client, installation, "13700003333")
        phone = "+8613700003333"
        guesses = [f"{index:06d}" for index in range(6) if f"{index:06d}" != sent["dev_code"]][:5]
        for guess in guesses:
            response = _verify_phone(client, private_key, installation, phone, sent, guess)
            assert response.status_code == 401
            assert response.json()["detail"] == "invalid_code"
        blocked = _verify_phone(client, private_key, installation, phone, sent, sent["dev_code"])
        assert blocked.status_code == 401
    finally:
        _cleanup_device(db, installation, [])


def test_link_phone_requires_auth():
    client = TestClient(app)
    response = client.post(
        "/auth/mobile/identities/phone",
        json={
            "phone": "+8613800138000",
            "code": "123456",
            "installation_id": "installation-id-0001",
            "challenge_id": str(uuid.uuid4()),
            "nonce": "n" * 32,
            "signature": "s" * 80,
        },
    )
    assert response.status_code == 401


def test_phone_login_is_stable_and_google_is_closed_without_config(monkeypatch):
    monkeypatch.setattr(settings, "sms_provider", "")
    monkeypatch.setattr(settings, "oauth_dev_mode", False)
    monkeypatch.setattr(settings, "google_client_ids", "")
    client = TestClient(app)
    installation, private_key = _register_device(client)
    db = next(get_db())
    user_ids: list[uuid.UUID] = []
    try:
        first = _phone_login(client, private_key, installation, "13800001111")
        user_ids.append(uuid.UUID(first["id"]))
        _age_phone_codes(db, installation)
        second = _phone_login(client, private_key, installation, "13800001111")
        assert second["id"] == first["id"]
        assert second["email"] == ""

        blocked = _oauth_login(
            client,
            private_key,
            installation,
            provider="google",
            id_token="header.payload.sig",
        )
        assert blocked.status_code == 503
        assert blocked.json()["detail"] == "provider_not_configured"
    finally:
        _cleanup_device(db, installation, user_ids)


def test_link_merges_into_the_earlier_user(monkeypatch):
    monkeypatch.setattr(settings, "sms_provider", "")
    monkeypatch.setattr(settings, "oauth_dev_mode", True)
    client = TestClient(app)
    installation, private_key = _register_device(client)
    db = next(get_db())
    user_ids: list[uuid.UUID] = []
    try:
        phone_user = _phone_login(client, private_key, installation, "13900002222")
        older_id = uuid.UUID(phone_user["id"])
        user_ids.append(older_id)
        older = db.get(User, older_id)
        assert older is not None
        older.created_at = utcnow() - timedelta(days=2)
        db.commit()

        google = _oauth_login(
            client,
            private_key,
            installation,
            provider="google",
            id_token="dev:google:merge-subject:merge@example.com",
        )
        assert google.status_code == 200, google.text
        google_token = google.json()["access_token"]
        newer_id = uuid.UUID(decode_access_token(google_token)["sub"])
        user_ids.append(newer_id)
        assert newer_id != older_id

        _age_phone_codes(db, installation)
        sent = _send_code(client, installation, "13900002222")
        signed = _sign(
            private_key,
            phone_login_message(
                uuid.UUID(sent["challenge_id"]),
                sent["nonce"],
                installation,
                "+8613900002222",
                sent["dev_code"],
            ),
        )
        linked = client.post(
            "/auth/mobile/identities/phone",
            headers={"Authorization": f"Bearer {google_token}"},
            json={
                "phone": "+8613900002222",
                "code": sent["dev_code"],
                "installation_id": installation,
                "challenge_id": sent["challenge_id"],
                "nonce": sent["nonce"],
                "signature": signed,
            },
        )
        assert linked.status_code == 200, linked.text
        survivor_id = uuid.UUID(decode_access_token(linked.json()["access_token"])["sub"])
        assert survivor_id == older_id

        db.expire_all()
        newer = db.get(User, newer_id)
        assert newer is not None
        assert newer.status == "merged"
        assert newer.merged_into_user_id == older_id
        identities = list(
            db.scalars(select(AuthIdentity).where(AuthIdentity.user_id == older_id)).all()
        )
        providers = {row.provider for row in identities}
        assert providers == {"phone", "google"}
        assert merge_accounts(db, newer, db.get(User, older_id)).id == older_id
    finally:
        _cleanup_device(db, installation, user_ids)


def test_merge_moves_membership_task_and_keeps_survivor_email():
    db = next(get_db())
    suffix = uuid.uuid4().hex[:8]
    older = User(
        id=uuid.uuid4(),
        email=f"older-{suffix}@example.com",
        display_name=f"older-{suffix}",
        password_hash=hash_password("password123!"),
        status="active",
        system_role="user",
    )
    newer = User(
        id=uuid.uuid4(),
        email=f"newer-{suffix}@example.com",
        display_name=f"newer-{suffix}",
        password_hash=hash_password("password123!"),
        status="active",
        system_role="user",
    )
    db.add_all([older, newer])
    db.flush()
    older.created_at = utcnow() - timedelta(days=4)
    workspace = Workspace(name=f"ws-{suffix}", created_by_user_id=older.id)
    db.add(workspace)
    db.flush()
    db.add_all(
        [
            WorkspaceMember(
                workspace_id=workspace.id, user_id=older.id, role="member", status="active"
            ),
            WorkspaceMember(
                workspace_id=workspace.id, user_id=newer.id, role="owner", status="active"
            ),
        ]
    )
    project = Project(workspace_id=workspace.id, name=f"p-{suffix}", created_by_user_id=newer.id)
    db.add(project)
    db.flush()
    db.add(
        ProjectMember(
            workspace_id=workspace.id,
            project_id=project.id,
            user_id=newer.id,
            role="member",
            status="active",
        )
    )
    item = Item(
        workspace_id=workspace.id,
        project_id=project.id,
        title="from newer",
        assignee_user_id=newer.id,
        created_by_user_id=newer.id,
        participant_user_ids=[newer.id],
    )
    db.add(item)
    db.add(
        AuthIdentity(
            user_id=newer.id,
            provider="phone",
            provider_tenant="timia",
            provider_subject=f"+8613900{suffix[:6]}",
            normalized_phone=f"+8613900{suffix[:6]}",
            phone_verified=True,
            email_verified=False,
        )
    )
    db.commit()
    older_email = older.email
    try:
        survivor = merge_accounts(db, newer, older)
        db.commit()
        assert survivor.id == older.id
        assert survivor.email == older_email
        db.expire_all()
        loser = db.get(User, newer.id)
        assert loser is not None
        assert loser.status == "merged"
        assert loser.email is None
        assert loser.merged_into_user_id == older.id
        members = list(
            db.scalars(
                select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace.id)
            ).all()
        )
        assert len(members) == 1
        assert members[0].user_id == older.id
        assert members[0].role == "owner"
        moved = db.get(Item, item.id)
        assert moved is not None
        assert moved.assignee_user_id == older.id
        assert moved.participant_user_ids == [older.id]
        identity = db.scalar(select(AuthIdentity).where(AuthIdentity.user_id == older.id))
        assert identity is not None
        assert identity.provider == "phone"
        again = merge_accounts(db, loser, survivor)
        assert again.id == older.id
    finally:
        db.rollback()
        db.execute(delete(Item).where(Item.id == item.id))
        db.execute(delete(ProjectMember).where(ProjectMember.project_id == project.id))
        db.execute(delete(Project).where(Project.id == project.id))
        db.execute(delete(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace.id))
        db.execute(delete(Workspace).where(Workspace.id == workspace.id))
        db.execute(delete(User).where(User.id == newer.id))
        db.execute(delete(User).where(User.id == older.id))
        db.commit()


def _register_device(client: TestClient) -> tuple[str, ec.EllipticCurvePrivateKey]:
    private_key = ec.generate_private_key(ec.SECP256R1())
    encoded_public = base64.b64encode(
        private_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    ).decode()
    installation = uuid.uuid4().hex
    challenge = client.post(
        "/auth/mobile/devices/challenge",
        json={"installation_id": installation, "purpose": "register"},
    )
    assert challenge.status_code == 200, challenge.text
    body = challenge.json()
    signature = _sign(
        private_key,
        registration_message(
            uuid.UUID(body["challenge_id"]),
            body["nonce"],
            installation,
            encoded_public,
        ),
    )
    registered = client.post(
        "/auth/mobile/devices/register",
        json={
            "installation_id": installation,
            "challenge_id": body["challenge_id"],
            "nonce": body["nonce"],
            "public_key": encoded_public,
            "signature": signature,
            "device_name": "pytest",
        },
    )
    assert registered.status_code == 200, registered.text
    return installation, private_key


def _phone_login(client, private_key, installation: str, raw_phone: str) -> dict:
    sent = _send_code(client, installation, raw_phone)
    phone = normalize_phone(raw_phone)
    signature = _sign(
        private_key,
        phone_login_message(
            uuid.UUID(sent["challenge_id"]),
            sent["nonce"],
            installation,
            phone,
            sent["dev_code"],
        ),
    )
    verified = client.post(
        "/auth/mobile/login/phone/verify",
        json={
            "phone": phone,
            "code": sent["dev_code"],
            "installation_id": installation,
            "challenge_id": sent["challenge_id"],
            "nonce": sent["nonce"],
            "signature": signature,
        },
    )
    assert verified.status_code == 200, verified.text
    token = verified.json()["access_token"]
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    return me.json()


def _verify_phone(client, private_key, installation: str, phone: str, sent: dict, code: str):
    signature = _sign(
        private_key,
        phone_login_message(
            uuid.UUID(sent["challenge_id"]),
            sent["nonce"],
            installation,
            phone,
            code,
        ),
    )
    return client.post(
        "/auth/mobile/login/phone/verify",
        json={
            "phone": phone,
            "code": code,
            "installation_id": installation,
            "challenge_id": sent["challenge_id"],
            "nonce": sent["nonce"],
            "signature": signature,
        },
    )


def _send_code(client: TestClient, installation: str, raw_phone: str) -> dict:
    sent = client.post(
        "/auth/mobile/login/phone/code",
        json={"phone": raw_phone, "installation_id": installation},
    )
    assert sent.status_code == 200, sent.text
    body = sent.json()
    assert body.get("dev_code")
    return body


def _oauth_login(client, private_key, installation: str, *, provider: str, id_token: str):
    challenge = client.post(
        "/auth/mobile/devices/challenge",
        json={"installation_id": installation, "purpose": "oauth"},
    )
    assert challenge.status_code == 200, challenge.text
    body = challenge.json()
    signature = _sign(
        private_key,
        oauth_login_message(
            uuid.UUID(body["challenge_id"]),
            body["nonce"],
            installation,
            provider,
            id_token,
        ),
    )
    return client.post(
        f"/auth/mobile/login/{provider}",
        json={
            "installation_id": installation,
            "challenge_id": body["challenge_id"],
            "nonce": body["nonce"],
            "signature": signature,
            "id_token": id_token,
        },
    )


def _sign(private_key, message: bytes) -> str:
    signature = private_key.sign(message, ec.ECDSA(hashes.SHA256()))
    return base64.b64encode(signature).decode()


def _age_phone_codes(db, installation: str) -> None:
    db.execute(
        update(AuthChallenge)
        .where(
            AuthChallenge.installation_id == installation,
            AuthChallenge.purpose == "phone_code",
        )
        .values(created_at=utcnow() - timedelta(minutes=2))
    )
    db.commit()


def _cleanup_device(db, installation: str, user_ids: list[uuid.UUID]) -> None:
    db.rollback()
    db.execute(delete(AuthChallenge).where(AuthChallenge.installation_id == installation))
    if user_ids:
        db.execute(
            delete(User).where(
                User.id.in_(user_ids),
                User.merged_into_user_id.is_not(None),
            )
        )
        db.execute(delete(User).where(User.id.in_(user_ids)))
    db.execute(delete(MobileDevice).where(MobileDevice.installation_id == installation))
    db.commit()


@pytest.fixture(autouse=True)
def _reset_settings():
    previous = (
        settings.sms_provider,
        settings.oauth_dev_mode,
        settings.google_client_ids,
    )
    yield
    (
        settings.sms_provider,
        settings.oauth_dev_mode,
        settings.google_client_ids,
    ) = previous
