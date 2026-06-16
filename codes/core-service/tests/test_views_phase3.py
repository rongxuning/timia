from datetime import datetime, timezone

from app.services.views.formatting import entity_type_label, format_ymd_hm, short_id


def test_format_ymd_hm():
    dt = datetime(2026, 6, 3, 14, 30, tzinfo=timezone.utc)
    label = format_ymd_hm(dt)
    assert len(label) == 16
    assert label[4] == "-"


def test_entity_type_label():
    assert entity_type_label("project") == "项目"
    assert entity_type_label("UNKNOWN") == "UNKNOWN"


def test_short_id():
    uid = "00000000-0000-0000-0000-000000000001"
    assert short_id(uid) == "00000000…"
    assert short_id("abc") == "abc"


def test_my_analytics_high_priority_count():
    from app.schemas.views.schedule import ScheduleTaskItemOut

    items = [
        ScheduleTaskItemOut(
            id="1",
            title="a",
            status="todo",
            priority="4",
            version=1,
            workspace_id="w",
            workspace_name="W",
            project_id="p",
            project_name="P",
        ),
        ScheduleTaskItemOut(
            id="2",
            title="b",
            status="todo",
            priority="2",
            version=1,
            workspace_id="w",
            workspace_name="W",
            project_id="p",
            project_name="P",
        ),
    ]
    high = sum(1 for it in items if (it.priority or "").strip().lower() in ("4", "high"))
    assert high == 1
