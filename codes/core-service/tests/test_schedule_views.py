from datetime import datetime, timezone

from app.schemas.views.schedule import ScheduleTaskItemOut
from app.services.views.schedule_items import _count_dashboard, _count_quick_view, parse_anchor
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


def test_build_calendar_month_has_weeks():
    anchor = parse_anchor("2026-06-15")
    view = build_calendar_view([_item()], view="month", anchor=anchor)
    assert view.view == "month"
    assert view.month == "2026-06"
    assert view.anchor == "2026-06-15"
    assert len(view.weeks) == 5
    assert any(w.segments for w in view.weeks)
    assert view.day is None


def test_build_calendar_week_single_week():
    anchor = parse_anchor("2026-06-12")
    view = build_calendar_view([_item()], view="week", anchor=anchor)
    assert view.view == "week"
    assert len(view.weeks) == 1
    assert len(view.weeks[0].days) == 7
    assert view.weeks[0].days[0].key == "2026-06-07"


def test_build_calendar_day_includes_spanning_task():
    anchor = parse_anchor("2026-06-11")
    view = build_calendar_view([_item()], view="day", anchor=anchor)
    assert view.view == "day"
    assert view.day is not None
    assert view.day.key == "2026-06-11"
    assert len(view.day.items) == 1


def test_count_dashboard_health():
    stats = _count_dashboard([_item(status="done"), _item(id="i2", status="todo")])
    assert stats["health_percent"] == 50


def test_count_quick_view_today_overdue_and_week():
    today = parse_anchor("2026-06-11")
    now = datetime(2026, 6, 11, 12, 0, tzinfo=timezone.utc)

    today_todo = _item(
        id="today",
        status="todo",
        start_at=datetime(2026, 6, 11, 9, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 6, 11, 18, 0, tzinfo=timezone.utc),
    )
    overdue = _item(
        id="overdue",
        status="doing",
        start_at=datetime(2026, 6, 9, 9, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 6, 10, 18, 0, tzinfo=timezone.utc),
    )
    due_week = _item(
        id="week",
        status="todo",
        start_at=datetime(2026, 6, 13, 9, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 6, 13, 18, 0, tzinfo=timezone.utc),
    )
    done = _item(id="done", status="done")

    stats = _count_quick_view(
        [today_todo, overdue, due_week, done],
        today=today,
        now=now,
    )
    assert stats["today_todo_count"] == 1
    assert stats["overdue_count"] == 1
    assert stats["due_this_week_count"] == 2
