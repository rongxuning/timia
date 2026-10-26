from app.core.config import settings
from app.models.notification import NotificationDelivery
from tests.helpers import make_project, make_user, token_for


def _headers() -> dict[str, str]:
    return {"X-Internal-Token": settings.notification_internal_token}


def _create(client, **overrides):
    body = {
        "scenario_key": "task_member_added",
        "sender_user_id": overrides.pop("sender_user_id"),
        "link": "/workspace/w/projects/p/items/i",
        "audience": {"type": "user_ids", "user_ids": overrides.pop("user_ids")},
        "variables": {"actor_name": "alice", "task_title": "写方案"},
        "timing": "immediate",
    }
    body.update(overrides)
    return client.post("/v1/notifications", json=body, headers=_headers())


def test_create_expands_deliveries_dedupes_and_skips_sender(client, db):
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    resp = _create(
        client,
        sender_user_id=str(alice.id),
        user_ids=[str(bob.id), str(bob.id), str(alice.id)],
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "delivered"
    assert body["delivery_count"] == 1
    assert body["scenario_key"] == "task_member_added"

    rows = db.query(NotificationDelivery).all()
    assert len(rows) == 1
    assert rows[0].user_id == bob.id
    assert rows[0].read_at is None
    assert rows[0].push_status == "skipped"

    inbox = client.get("/v1/inbox", headers={"Authorization": f"Bearer {token_for(bob)}"})
    assert inbox.status_code == 200, inbox.text
    payload = inbox.json()
    assert payload["unread_count"] == 1
    item = payload["items"][0]
    assert item["title"] == "你被加入了任务"
    assert "alice" in item["body"]
    assert "写方案" in item["body"]
    assert item["sender_display_name"] == "alice"
    assert item["link"].endswith("/items/i")


def test_disabled_scenario_does_not_deliver(client, db):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    auth = {"Authorization": f"Bearer {token_for(admin)}"}
    listed = client.get("/v1/admin/scenarios", headers=auth)
    assert listed.status_code == 200, listed.text
    keys = [row["key"] for row in listed.json()]
    assert keys[:5] == [
        "task_self_join",
        "task_member_added",
        "workspace_member_added",
        "project_member_added",
        "task_created_in_project",
    ]

    patched = client.patch(
        "/v1/admin/scenarios/task_member_added",
        json={"enabled": False},
        headers=auth,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["enabled"] is False

    resp = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id)])
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "skipped"
    assert resp.json()["delivery_count"] == 0
    assert db.query(NotificationDelivery).count() == 0

    denied = client.patch(
        "/v1/admin/scenarios/task_member_added",
        json={"enabled": True},
        headers={"Authorization": f"Bearer {token_for(bob)}"},
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] == "admin_required"


def test_inbox_read_and_read_all(client, db):
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    carol = make_user(db, "carol")
    first = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id), str(carol.id)])
    assert first.status_code == 201
    second = _create(
        client,
        sender_user_id=str(alice.id),
        user_ids=[str(bob.id)],
        scenario_key="task_self_join",
        variables={"actor_name": "bob", "task_title": "复查"},
    )
    assert second.status_code == 201

    bob_headers = {"Authorization": f"Bearer {token_for(bob)}"}
    inbox = client.get("/v1/inbox", headers=bob_headers).json()
    assert inbox["unread_count"] == 2
    delivery_id = inbox["items"][0]["id"]

    other = client.post(
        f"/v1/inbox/{delivery_id}/read",
        headers={"Authorization": f"Bearer {token_for(carol)}"},
    )
    assert other.status_code == 404
    assert other.json()["detail"] == "not_found"

    read = client.post(f"/v1/inbox/{delivery_id}/read", headers=bob_headers)
    assert read.status_code == 200, read.text
    assert read.json()["read_at"] is not None
    assert client.get("/v1/inbox", headers=bob_headers).json()["unread_count"] == 1

    again = client.post(f"/v1/inbox/{delivery_id}/read", headers=bob_headers)
    assert again.status_code == 200

    cleared = client.post("/v1/inbox/read-all", headers=bob_headers)
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["updated"] == 1
    assert client.get("/v1/inbox", headers=bob_headers).json()["unread_count"] == 0
    carol_inbox = client.get("/v1/inbox", headers={"Authorization": f"Bearer {token_for(carol)}"}).json()
    assert carol_inbox["unread_count"] == 1


def test_scheduled_stores_without_deliveries(client, db):
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    resp = _create(
        client,
        sender_user_id=str(alice.id),
        user_ids=[str(bob.id)],
        timing="scheduled",
        scheduled_at="2026-12-01T00:00:00Z",
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "scheduled"
    assert resp.json()["delivery_count"] == 0
    assert db.query(NotificationDelivery).count() == 0


def test_project_audience_excludes_sender(client, db):
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    _, project = make_project(db, alice, bob)
    resp = client.post(
        "/v1/notifications",
        headers=_headers(),
        json={
            "scenario_key": "task_created_in_project",
            "sender_user_id": str(alice.id),
            "link": f"/workspace/{project.workspace_id}/projects/{project.id}/items/1",
            "audience": {"type": "project_id", "project_id": str(project.id)},
            "variables": {"actor_name": "alice", "task_title": "新任务", "project_name": "项目"},
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["delivery_count"] == 1
    inbox = client.get("/v1/inbox", headers={"Authorization": f"Bearer {token_for(bob)}"}).json()
    assert inbox["unread_count"] == 1
    assert "项目" in inbox["items"][0]["body"]
    alice_inbox = client.get("/v1/inbox", headers={"Authorization": f"Bearer {token_for(alice)}"}).json()
    assert alice_inbox["unread_count"] == 0


def test_missing_tokens_are_rejected(client, db):
    user = make_user(db, "alice")
    assert client.get("/v1/inbox").status_code == 401
    assert client.post("/v1/notifications", json={}).status_code == 401
    assert client.get("/health").json() == {"ok": True}
    assert client.post(
        "/internal/push/dispatch",
        headers={"X-Internal-Token": "nope"},
    ).status_code == 401
    _ = user


def test_push_stub_counts_pending(client, db):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    patched = client.patch(
        "/v1/admin/scenarios/task_member_added",
        json={"push_enabled": True},
        headers={"Authorization": f"Bearer {token_for(admin)}"},
    )
    assert patched.status_code == 200
    created = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id)])
    assert created.json()["delivery_count"] == 1
    row = db.query(NotificationDelivery).one()
    assert row.push_status == "pending"
    stub = client.post("/internal/push/dispatch", headers=_headers())
    assert stub.status_code == 200, stub.text
    assert stub.json()["detail"] == "push_not_configured"
    assert stub.json()["pending"] == 1
    db.refresh(row)
    assert row.push_status == "pending"
