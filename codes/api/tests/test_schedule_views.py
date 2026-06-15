from datetime import datetime, timezone

from app.schemas.views.schedule import ScheduleTaskItemOut
from app.services.views.schedule_items import _count_dashboard
from app.services.views.schedule_layout import build_calendar_view, build_priority_view, build_swimlane_view


def _item(**kwargs) -> ScheduleTaskItemOut:
    base = {
        "id": "i1",
        "title": "Task",
        "body": None,
        "status": "todo",
        "priority": "2",
        "start_at": datetime(2026, 6, 10, 9, 0, tzinfo=timezone.utc),
        "end_at": datetime(2026, 6, 12, 18, 0, tzinfo=timezone.utc),
        "details": None,
        "version": 1,
        "created_by": None,
        "assignee": None,
        "participants": [],
        "location": None,
        "workspace_id": "w1",
        "workspace_name": "WS",
        "project_id": "p1",
        "project_name": "Proj",
    }
    base.update(kwargs)
    return ScheduleTaskItemOut(**base)


def test_build_swimlane_groups_by_status():
    items = [_item(status="todo"), _item(id="i2", status="doing")]
    view = build_swimlane_view(items)
    assert len(view.columns["todo"]) == 1
    assert len(view.columns["doing"]) == 1


def test_build_priority_only_active_statuses():
    items = [_item(status="todo"), _item(id="i2", status="done")]
    view = build_priority_view(items)
    assert len(view.quadrants["2"]) == 1
    assert sum(len(v) for v in view.quadrants.values()) == 1


def test_build_calendar_has_weeks():
    view = build_calendar_view([_item()], 2026, 6)
    assert view.month == "2026-06"
    assert len(view.weeks) == 5
    assert any(w.segments for w in view.weeks)


def test_count_dashboard_health():
    stats = _count_dashboard([_item(status="done"), _item(id="i2", status="todo")])
    assert stats["health_percent"] == 50
