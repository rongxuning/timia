import importlib

from app.models.notification import NotificationDelivery, NotificationScenario
from app.services.push import push_status_for
from app.services.scenarios import (
    DEFAULT_SCENARIO_KEYS,
    DEFAULT_SCENARIOS,
    PUSH_BACKFILL_KEY,
    ensure_default_scenarios,
)
from tests.helpers import make_user, token_for
from tests.test_notifications import _create


def test_push_status_for_pending_without_scenario_and_when_enabled():
    assert push_status_for(None) == "pending"
    enabled = NotificationScenario(
        key="task_member_added",
        enabled=True,
        push_enabled=True,
        title_template="标题",
        body_template="正文",
    )
    assert push_status_for(enabled) == "pending"


def test_push_status_for_skips_when_scenario_push_is_off():
    disabled = NotificationScenario(
        key="task_member_added",
        enabled=True,
        push_enabled=False,
        title_template="标题",
        body_template="正文",
    )
    assert push_status_for(disabled) == "skipped"


def test_ensure_backfills_existing_false_rows_once_and_inserts_the_rest(db):
    legacy = NotificationScenario(
        key="task_commented",
        enabled=False,
        push_enabled=False,
        title_template="自定义标题",
        body_template="自定义正文",
    )
    db.add(legacy)
    db.commit()

    ensure_default_scenarios(db)
    db.commit()

    rows = {row.key: row for row in db.query(NotificationScenario).all()}
    assert PUSH_BACKFILL_KEY in rows
    assert set(rows) == {*DEFAULT_SCENARIO_KEYS, PUSH_BACKFILL_KEY}
    commented = rows["task_commented"]
    assert commented.push_enabled is True
    assert commented.enabled is False
    assert commented.title_template == "自定义标题"
    assert commented.body_template == "自定义正文"
    assert all(rows[key].push_enabled for key in DEFAULT_SCENARIO_KEYS)

    commented.push_enabled = False
    db.commit()
    ensure_default_scenarios(db)
    db.commit()
    db.refresh(commented)
    assert commented.push_enabled is False


def test_default_scenarios_ship_with_push_on():
    assert [row["key"] for row in DEFAULT_SCENARIOS] == list(DEFAULT_SCENARIO_KEYS)
    assert all(row["push_enabled"] is True for row in DEFAULT_SCENARIOS)


def test_migration_backfill_matches_scenario_keys():
    migration = importlib.import_module("app.migrations.versions.0003_default_scenario_push")
    assert migration.SCENARIO_KEYS == DEFAULT_SCENARIO_KEYS
    assert migration.PUSH_BACKFILL_KEY == PUSH_BACKFILL_KEY
    assert migration.down_revision == "0002_device_push_tokens"


def test_admin_can_keep_push_off_and_broadcasts_stay_pending(client, db):
    admin = make_user(db, "admin", role="admin")
    alice = make_user(db, "alice")
    bob = make_user(db, "bob")
    auth = {"Authorization": f"Bearer {token_for(admin)}"}

    listed = client.get("/v1/admin/scenarios", headers=auth)
    assert listed.status_code == 200, listed.text
    keys = [row["key"] for row in listed.json()]
    assert PUSH_BACKFILL_KEY not in keys
    assert all(row["push_enabled"] is True for row in listed.json())

    hidden = client.patch(
        f"/v1/admin/scenarios/{PUSH_BACKFILL_KEY}",
        json={"push_enabled": False},
        headers=auth,
    )
    assert hidden.status_code == 404
    assert hidden.json()["detail"] == "not_found"

    patched = client.patch(
        "/v1/admin/scenarios/task_member_added",
        json={"push_enabled": False},
        headers=auth,
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["push_enabled"] is False

    created = _create(client, sender_user_id=str(alice.id), user_ids=[str(bob.id)])
    assert created.status_code == 201, created.text
    scenario_delivery = db.query(NotificationDelivery).one()
    assert scenario_delivery.push_status == "skipped"

    again = client.get("/v1/admin/scenarios", headers=auth)
    row = next(item for item in again.json() if item["key"] == "task_member_added")
    assert row["push_enabled"] is False
    assert row["enabled"] is True

    broadcast = client.post(
        "/v1/admin/notifications",
        json={
            "title": "维护通知",
            "body": "今晚升级",
            "audience": {"type": "user_ids", "user_ids": [str(bob.id)]},
            "timing": "immediate",
        },
        headers=auth,
    )
    assert broadcast.status_code == 201, broadcast.text
    assert broadcast.json()["scenario_key"] is None
    deliveries = db.query(NotificationDelivery).all()
    broadcast_delivery = next(item for item in deliveries if item.id != scenario_delivery.id)
    assert broadcast_delivery.user_id == bob.id
    assert broadcast_delivery.push_status == "pending"
    db.refresh(scenario_delivery)
    assert scenario_delivery.push_status == "skipped"
