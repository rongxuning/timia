import os
import uuid

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test_secret")

from app.services.file_notify import notify_item_rehomed, notify_item_unbound, notify_project_rehomed


def test_notify_is_noop_when_unconfigured(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "file_service_base", "")
    monkeypatch.setattr(config.settings, "file_internal_token", "")
    notify_item_unbound(uuid.uuid4())


def test_notify_posts_internal_json(monkeypatch):
    from app.core import config

    monkeypatch.setattr(config.settings, "file_service_base", "http://file-service:8003")
    monkeypatch.setattr(config.settings, "file_internal_token", "secret")
    calls: list[dict] = []

    class FakeResp:
        status_code = 204
        text = ""

    class FakeClient:
        def __init__(self, timeout):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, json, headers):
            calls.append({"url": url, "json": json, "headers": headers})
            return FakeResp()

    monkeypatch.setattr("app.services.file_notify.httpx.Client", FakeClient)
    item_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    ws = uuid.UUID("00000000-0000-0000-0000-000000000002")
    project = uuid.UUID("00000000-0000-0000-0000-000000000003")
    notify_item_unbound(item_id)
    notify_item_rehomed(item_id, ws, project)
    notify_project_rehomed(project, ws)
    assert [c["url"] for c in calls] == [
        "http://file-service:8003/internal/bindings/unbind",
        "http://file-service:8003/internal/bindings/rehome",
        "http://file-service:8003/internal/bindings/rehome-project",
    ]
    assert all(c["headers"]["X-Internal-Token"] == "secret" for c in calls)
    assert "file" not in calls[0]["json"]
