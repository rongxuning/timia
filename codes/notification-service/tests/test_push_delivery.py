import json

import httpx
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app.core.config import settings
from app.models.notification import DevicePushToken, NotificationDelivery
from app.services.apns import reset_provider_token_cache, set_http_client_factory
from app.services.dispatch import dispatch_due_notifications
from tests.helpers import make_user, token_for
from tests.test_dispatch import _due_at
from tests.test_notifications import _create, _headers


def _pem() -> str:
    key = ec.generate_private_key(ec.SECP256R1())
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


def _device_token(byte: int = 0xAB) -> str:
    return f"{byte:02x}" * 32


@pytest.fixture
def configured_apns():
    saved = (
        settings.apns_key_id,
        settings.apns_team_id,
        settings.apns_bundle_id,
        settings.apns_key_p8,
        settings.apns_use_sandbox,
    )
    settings.apns_key_id = "KEYID12345"
    settings.apns_team_id = "TEAMID1234"
    settings.apns_bundle_id = "online.timia.ios"
    settings.apns_key_p8 = _pem()
    settings.apns_use_sandbox = True
    reset_provider_token_cache()
    yield
    (
        settings.apns_key_id,
        settings.apns_team_id,
        settings.apns_bundle_id,
        settings.apns_key_p8,
        settings.apns_use_sandbox,
    ) = saved
    reset_provider_token_cache()
    set_http_client_factory(None)


def _enable_push(client, admin) -> None:
    patched = client.patch(
        "/v1/admin/scenarios/task_member_added",
        json={"push_enabled": True},
        headers={"Authorization": f"Bearer {token_for(admin)}"},
    )
    assert patched.status_code == 200, patched.text


def _register(client, user, token: str, *, environment: str = "sandbox"):
    resp = client.post(
        "/v1/devices/apns",
        json={"token": token, "environment": environment},
        headers={"Authorization": f"Bearer {token_for(user)}"},
    )
    assert resp.status_code == 200, resp.text
    return resp


def _capture(handler):
    seen: list[httpx.Request] = []

    def _wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    def factory() -> httpx.Client:
        return httpx.Client(transport=httpx.MockTransport(_wrapped))

    set_http_client_factory(factory)
    return seen


def test_register_normalizes_rebinds_and_deletes(client, db):
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    raw = "<" + " ".join(_device_token(0xAB)[i : i + 2] for i in range(0, 64, 2)) + ">"
    registered = _register(client, alice, raw.upper())
    assert registered.json()["environment"] == "sandbox"
    assert registered.json()["platform"] == "apns"
    row = db.query(DevicePushToken).one()
    assert row.user_id == alice.id
    assert row.token == _device_token(0xAB)
    assert row.invalidated_at is None

    rebound = _register(client, bob, row.token)
    assert rebound.status_code == 200
    db.refresh(row)
    assert row.user_id == bob.id

    denied = client.delete(
        f"/v1/devices/apns/{row.token}",
        headers={"Authorization": f"Bearer {token_for(alice)}"},
    )
    assert denied.status_code == 404
    assert denied.json()["detail"] == "not_found"

    removed = client.delete(
        f"/v1/devices/apns/{row.token}",
        headers={"Authorization": f"Bearer {token_for(bob)}"},
    )
    assert removed.status_code == 204
    assert db.query(DevicePushToken).count() == 0

    assert client.post("/v1/devices/apns", json={"token": "abc"}).status_code == 401
    bad = client.post(
        "/v1/devices/apns",
        json={"token": "abc"},
        headers={"Authorization": f"Bearer {token_for(alice)}"},
    )
    assert bad.status_code == 400
    assert bad.json()["detail"] == "invalid_device_token"


def test_unconfigured_push_stays_pending(client, db):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    _enable_push(client, admin)
    _register(client, bob, _device_token())
    created = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id)])
    assert created.status_code == 201, created.text
    row = db.query(NotificationDelivery).one()
    assert row.push_status == "pending"
    stub = client.post("/internal/push/dispatch", headers=_headers())
    assert stub.status_code == 200, stub.text
    assert stub.json()["detail"] == "push_not_configured"
    assert stub.json()["ok"] is False
    db.refresh(row)
    assert row.push_status == "pending"


def test_configured_push_sends_on_create_and_clears_invalid_token(client, db, configured_apns):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    _enable_push(client, admin)
    good = _device_token(0x11)
    bad = _device_token(0x22)
    _register(client, bob, good)
    _register(client, bob, bad)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(bad):
            return httpx.Response(400, json={"reason": "BadDeviceToken"})
        return httpx.Response(200, json={})

    seen = _capture(handler)
    created = _create(
        client,
        sender_user_id=str(alice.id),
        user_ids=[str(bob.id)],
        link="/workspace/ws/projects/p/items/i",
    )
    assert created.status_code == 201, created.text
    row = db.query(NotificationDelivery).one()
    assert row.push_status == "sent"
    assert len(seen) == 2
    payload = json.loads(seen[0].content)
    assert payload["aps"]["alert"]["title"] == "你被加入了任务"
    assert payload["aps"]["sound"] == "default"
    assert payload["link"] == "/workspace/ws/projects/p/items/i"
    assert seen[0].headers["apns-topic"] == "online.timia.ios"
    assert seen[0].headers["apns-push-type"] == "alert"
    assert seen[0].url.host == "api.sandbox.push.apple.com"
    assert seen[0].headers["authorization"].startswith("bearer ")
    tokens = {item.token: item for item in db.query(DevicePushToken).all()}
    assert tokens[bad].invalidated_at is not None
    assert tokens[good].invalidated_at is None

    again = _register(client, bob, bad)
    assert again.status_code == 200
    db.refresh(tokens[bad])
    assert tokens[bad].invalidated_at is None


def test_unregistered_token_is_invalidated_and_delivery_fails(client, db, configured_apns):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    _enable_push(client, admin)
    token = _device_token(0x33)
    _register(client, bob, token)
    _capture(lambda _request: httpx.Response(410, json={"reason": "Unregistered"}))
    created = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id)])
    assert created.status_code == 201, created.text
    assert db.query(NotificationDelivery).one().push_status == "failed"
    assert db.query(DevicePushToken).one().invalidated_at is not None


def test_transport_error_keeps_pending_and_create_succeeds(client, db, configured_apns):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    _enable_push(client, admin)
    _register(client, bob, _device_token(0x44))

    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    _capture(handler)
    created = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id)])
    assert created.status_code == 201, created.text
    assert db.query(NotificationDelivery).one().push_status == "pending"


def test_no_matching_token_is_skipped_when_configured(client, db, configured_apns):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    _enable_push(client, admin)
    _register(client, bob, _device_token(0x55), environment="production")
    seen = _capture(lambda _request: httpx.Response(200, json={}))
    created = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id)])
    assert created.status_code == 201, created.text
    assert db.query(NotificationDelivery).one().push_status == "skipped"
    assert seen == []


def test_due_notification_pushes_after_expand(client, db, configured_apns):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    _enable_push(client, admin)
    _register(client, bob, _device_token(0x66))
    seen = _capture(lambda _request: httpx.Response(200, json={}))
    created = _create(
        client,
        sender_user_id=str(alice.id),
        user_ids=[str(bob.id)],
        timing="delay",
        scheduled_at=_due_at(),
    )
    assert created.status_code == 201, created.text
    assert created.json()["delivery_count"] == 0
    assert seen == []
    result = dispatch_due_notifications(db)
    assert result["delivered"] == 1
    assert db.query(NotificationDelivery).one().push_status == "sent"
    assert len(seen) == 1


def test_dispatch_sends_rows_left_pending_before_keys(client, db, configured_apns):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    _enable_push(client, admin)
    pem = settings.apns_key_p8
    settings.apns_key_p8 = ""
    _register(client, bob, _device_token(0x77))
    created = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id)])
    assert created.status_code == 201
    assert db.query(NotificationDelivery).one().push_status == "pending"
    settings.apns_key_p8 = pem
    reset_provider_token_cache()
    seen = _capture(lambda _request: httpx.Response(200, json={}))
    stub = client.post("/internal/push/dispatch", headers=_headers())
    assert stub.status_code == 200, stub.text
    body = stub.json()
    assert body["ok"] is True
    assert body["detail"] == "dispatched"
    assert body["sent"] == 1
    assert body["pending"] == 0
    assert len(seen) == 1
    db.refresh(db.query(NotificationDelivery).one())
    assert db.query(NotificationDelivery).one().push_status == "sent"
