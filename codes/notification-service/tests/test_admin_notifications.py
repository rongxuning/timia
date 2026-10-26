from datetime import UTC, datetime, timedelta

from app.models.identity import User
from app.models.notification import Notification, NotificationDelivery
from tests.helpers import make_project, make_user, token_for


def _auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {token_for(user)}"}


def _send(client, admin: User, **overrides):
    body = {
        "title": "维护通知",
        "body": "今晚升级",
        "link": "/my/notifications",
        "audience": {"type": "broadcast"},
        "timing": "immediate",
    }
    body.update(overrides)
    return client.post("/v1/admin/notifications", json=body, headers=_auth(admin))


def test_admin_broadcast_excludes_sender_and_inactive(client, db):
    admin = make_user(db, "admin", role="admin")
    bob = make_user(db, "bob")
    inactive = make_user(db, "old")
    inactive.status = "disabled"
    db.commit()
    resp = _send(client, admin)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "delivered"
    assert body["delivery_count"] == 1
    assert body["scenario_key"] is None
    rows = db.query(NotificationDelivery).all()
    assert len(rows) == 1
    assert rows[0].user_id == bob.id
    assert rows[0].push_status == "skipped"
    inbox = client.get("/v1/inbox", headers=_auth(bob)).json()
    assert inbox["items"][0]["title"] == "维护通知"
    assert inbox["items"][0]["sender_display_name"] == "admin"
    admin_inbox = client.get("/v1/inbox", headers=_auth(admin)).json()
    assert admin_inbox["unread_count"] == 0


def test_admin_user_project_and_workspace_audiences(client, db):
    admin = make_user(db, "admin", role="admin")
    bob = make_user(db, "bob")
    carol = make_user(db, "carol")
    workspace, project = make_project(db, admin, bob)

    users = _send(
        client,
        admin,
        audience={"type": "user_ids", "user_ids": [str(bob.id), str(carol.id), str(admin.id)]},
    )
    assert users.status_code == 201, users.text
    assert users.json()["delivery_count"] == 2

    project_resp = _send(
        client,
        admin,
        title="项目通知",
        audience={"type": "project_id", "project_id": str(project.id)},
    )
    assert project_resp.status_code == 201, project_resp.text
    assert project_resp.json()["delivery_count"] == 1

    workspace_resp = _send(
        client,
        admin,
        title="空间通知",
        audience={"type": "workspace_id", "workspace_id": str(workspace.id)},
    )
    assert workspace_resp.status_code == 201, workspace_resp.text
    assert workspace_resp.json()["delivery_count"] == 1

    bob_inbox = client.get("/v1/inbox", headers=_auth(bob)).json()
    titles = {item["title"] for item in bob_inbox["items"]}
    assert titles == {"维护通知", "项目通知", "空间通知"}
    carol_inbox = client.get("/v1/inbox", headers=_auth(carol)).json()
    assert [item["title"] for item in carol_inbox["items"]] == ["维护通知"]


def test_admin_delay_waits_for_schedule(client, db):
    admin = make_user(db, "admin", role="admin")
    bob = make_user(db, "bob")
    when = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    resp = _send(
        client,
        admin,
        audience={"type": "user_ids", "user_ids": [str(bob.id)]},
        timing="scheduled",
        scheduled_at=when,
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "scheduled"
    assert resp.json()["delivery_count"] == 0
    assert db.query(NotificationDelivery).count() == 0
    row = db.query(Notification).one()
    assert row.timing == "scheduled"
    assert row.sender_user_id == admin.id


def test_admin_rejects_non_admin_and_bad_payloads(client, db):
    admin = make_user(db, "admin", role="admin")
    bob = make_user(db, "bob")
    denied = _send(client, bob, title="nope")
    assert denied.status_code == 403
    assert denied.json()["detail"] == "admin_required"

    missing = _send(client, admin, title="  ")
    assert missing.status_code == 400
    assert missing.json()["detail"] == "missing_title"

    unscheduled = _send(client, admin, timing="delay")
    assert unscheduled.status_code == 400
    assert unscheduled.json()["detail"] == "missing_scheduled_at"

    bad_link = _send(client, admin, link="javascript:alert(1)")
    assert bad_link.status_code == 400
    assert bad_link.json()["detail"] == "invalid_link"

    empty_users = _send(client, admin, audience={"type": "user_ids", "user_ids": []})
    assert empty_users.status_code == 400
    assert empty_users.json()["detail"] == "invalid_audience"

    missing_project = _send(client, admin, audience={"type": "project_id"})
    assert missing_project.status_code == 400
    assert missing_project.json()["detail"] == "invalid_audience"
    assert client.post("/v1/admin/notifications", json={"title": "x"}).status_code == 401
