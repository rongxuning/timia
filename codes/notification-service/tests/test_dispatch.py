from datetime import UTC, datetime, timedelta

from app.models.notification import Notification, NotificationDelivery
from app.services.dispatch import dispatch_due_notifications
from tests.helpers import make_user, token_for
from tests.test_notifications import _create


def _due_at() -> str:
    return (datetime.now(UTC) - timedelta(minutes=5)).isoformat()


def _future_at() -> str:
    return (datetime.now(UTC) + timedelta(hours=2)).isoformat()


def test_future_delay_and_scheduled_are_not_delivered(client, db):
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    for timing in ("delay", "scheduled"):
        resp = _create(
            client,
            sender_user_id=str(alice.id),
            user_ids=[str(bob.id)],
            timing=timing,
            scheduled_at=_future_at(),
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["status"] == "scheduled"
        assert resp.json()["delivery_count"] == 0

    result = dispatch_due_notifications(db)
    assert result["delivered"] == 0
    assert result["delivery_count"] == 0
    assert db.query(NotificationDelivery).count() == 0
    statuses = {row.timing: row.status for row in db.query(Notification).all()}
    assert statuses == {"delay": "scheduled", "scheduled": "scheduled"}


def test_due_notification_delivers_once_and_skips_sender(client, db):
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    resp = _create(
        client,
        sender_user_id=str(alice.id),
        user_ids=[str(bob.id), str(bob.id), str(alice.id)],
        timing="delay",
        scheduled_at=_due_at(),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["delivery_count"] == 0

    result = dispatch_due_notifications(db)
    assert result["delivered"] == 1
    assert result["delivery_count"] == 1
    rows = db.query(NotificationDelivery).all()
    assert len(rows) == 1
    assert rows[0].user_id == bob.id

    again = dispatch_due_notifications(db)
    assert again["delivered"] == 0
    assert db.query(NotificationDelivery).count() == 1

    inbox = client.get("/v1/inbox", headers={"Authorization": f"Bearer {token_for(bob)}"})
    assert inbox.status_code == 200, inbox.text
    assert inbox.json()["unread_count"] == 1
    alice_inbox = client.get("/v1/inbox", headers={"Authorization": f"Bearer {token_for(alice)}"})
    assert alice_inbox.json()["unread_count"] == 0


def test_due_scheduled_respects_scenario_switch(client, db):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    created = _create(
        client,
        sender_user_id=str(alice.id),
        user_ids=[str(bob.id)],
        timing="scheduled",
        scheduled_at=_due_at(),
    )
    assert created.status_code == 201, created.text

    patched = client.patch(
        "/v1/admin/scenarios/task_member_added",
        json={"enabled": False},
        headers={"Authorization": f"Bearer {token_for(admin)}"},
    )
    assert patched.status_code == 200, patched.text

    result = dispatch_due_notifications(db)
    assert result["delivered"] == 0
    assert result["skipped"] == 1
    assert db.query(NotificationDelivery).count() == 0
    row = db.query(Notification).one()
    assert row.status == "skipped"
