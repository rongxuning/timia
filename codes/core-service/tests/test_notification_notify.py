import uuid

import httpx

from app.core.config import settings
from app.services.notification_audience import NotificationIntent
from app.services.notification_notify import dispatch_notifications


def _intent() -> NotificationIntent:
    return NotificationIntent(
        scenario_key="workspace_member_added",
        sender_user_id=uuid.uuid4(),
        user_ids=[uuid.uuid4()],
        link="/workspace/w",
        variables={"actor_name": "我", "workspace_name": "空间"},
    )


def test_dispatch_skips_when_base_unset(monkeypatch):
    monkeypatch.setattr(settings, "notification_service_base", "")
    monkeypatch.setattr(settings, "notification_internal_token", "tok")
    called = {"n": 0}

    def _client(*args, **kwargs):
        called["n"] += 1
        raise AssertionError("should not open a client")

    monkeypatch.setattr(httpx, "Client", _client)
    dispatch_notifications([_intent()], background=False)
    assert called["n"] == 0


def test_dispatch_swallows_connect_error(monkeypatch):
    monkeypatch.setattr(settings, "notification_service_base", "http://notification-service:8001")
    monkeypatch.setattr(settings, "notification_internal_token", "tok")
    posts: list[dict] = []

    class Boom:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, json, headers):
            posts.append({"url": url, "json": json, "headers": headers})
            raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "Client", lambda *args, **kwargs: Boom())
    dispatch_notifications([_intent()], background=False)
    assert posts[0]["url"].endswith("/v1/notifications")
    assert posts[0]["headers"]["X-Internal-Token"] == "tok"
    assert posts[0]["json"]["audience"]["type"] == "user_ids"
    assert posts[0]["json"]["scenario_key"] == "workspace_member_added"
