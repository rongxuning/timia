from datetime import datetime, timezone

import pytest

from app.schemas.views.schedule import ScheduleTaskItemOut
from app.services.views.schedule_items import _count_dashboard, _count_quick_view, parse_anchor
from app.services.views.schedule_layout import (
    build_calendar_view,
    build_overdue_view,
    build_priority_view,
    build_swimlane_view,
    build_undated_view,
)


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
    assert view.totals["todo"] == 1
    assert view.has_more["todo"] is False
    assert view.has_more["doing"] is False


def test_build_swimlane_pages_active_tasks_when_limited():
    items = [_item(id=f"todo-{index}", status="todo") for index in range(8)]
    items.extend(_item(id=f"doing-{index}", status="doing") for index in range(3))

    initial = build_swimlane_view(items, active_limit=5)
    assert [item.id for item in initial.columns["todo"]] == [
        "todo-0",
        "todo-1",
        "todo-2",
        "todo-3",
        "todo-4",
    ]
    assert len(initial.columns["doing"]) == 3
    assert initial.totals["todo"] == 8
    assert initial.has_more["todo"] is True
    assert initial.has_more["doing"] is False

    next_page = build_swimlane_view(items, task_status="todo", offset=5, limit=5)
    assert [item.id for item in next_page.columns["todo"]] == ["todo-5", "todo-6", "todo-7"]
    assert next_page.has_more["todo"] is False


def test_build_swimlane_pages_todos_for_anchor_day_only():
    shanghai = datetime(2026, 8, 17, 3, 0, tzinfo=timezone.utc)  # 11:00 Asia/Shanghai
    other_day = datetime(2026, 8, 16, 3, 0, tzinfo=timezone.utc)
    on_day = [
        _item(
            id=f"day-{index}",
            status="todo",
            start_at=shanghai,
            end_at=shanghai.replace(hour=4),
        )
        for index in range(6)
    ]
    other = [
        _item(
            id=f"other-{index}",
            status="todo",
            start_at=other_day,
            end_at=other_day.replace(hour=4),
        )
        for index in range(4)
    ]

    view = build_swimlane_view(
        other + on_day,
        active_limit=5,
        day=parse_anchor("2026-08-17"),
        timezone_name="Asia/Shanghai",
    )
    assert [item.id for item in view.columns["todo"]] == [
        "day-0",
        "day-1",
        "day-2",
        "day-3",
        "day-4",
    ]
    assert view.totals["todo"] == 6
    assert view.has_more["todo"] is True

    next_page = build_swimlane_view(
        other + on_day,
        task_status="todo",
        offset=5,
        limit=5,
        day=parse_anchor("2026-08-17"),
        timezone_name="Asia/Shanghai",
    )
    assert [item.id for item in next_page.columns["todo"]] == ["day-5"]
    assert next_page.has_more["todo"] is False


def test_build_swimlane_collapses_and_pages_completed_tasks():
    items = [
        _item(
            id=f"done-{index}",
            status="done",
            completed_at=datetime(2026, 6, index + 1, tzinfo=timezone.utc),
        )
        for index in range(18)
    ]

    initial = build_swimlane_view(items)
    assert len(initial.columns["done"]) == 5
    assert initial.totals["done"] == 18
    assert initial.has_more["done"] is True
    assert initial.columns["done"][0].id == "done-17"

    next_page = build_swimlane_view(items, task_status="done", offset=5, limit=10)
    assert len(next_page.columns["done"]) == 10
    assert next_page.columns["done"][0].id == "done-12"
    assert next_page.has_more["done"] is True

    last_page = build_swimlane_view(items, task_status="done", offset=15, limit=10)
    assert len(last_page.columns["done"]) == 3
    assert last_page.has_more["done"] is False


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


def test_build_calendar_year_has_twelve_month_summaries():
    anchor = parse_anchor("2026-07-20")
    view = build_calendar_view([_item()], view="year", anchor=anchor)
    assert view.view == "year"
    assert view.year == 2026
    assert len(view.months) == 12
    june = view.months[5]
    assert june.month == 6
    assert june.task_count == 1
    assert sum(day.task_count for day in june.days) == 4


def test_build_calendar_groups_utc_instant_by_requested_timezone():
    item = _item(
        id="timezone-boundary",
        start_at=datetime(2026, 7, 26, 18, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 7, 26, 19, 0, tzinfo=timezone.utc),
    )

    utc_day = build_calendar_view(
        [item],
        view="day",
        anchor=parse_anchor("2026-07-26"),
        timezone_name="Asia/Shanghai",
    )
    local_day = build_calendar_view(
        [item],
        view="day",
        anchor=parse_anchor("2026-07-27"),
        timezone_name="Asia/Shanghai",
    )
    week = build_calendar_view(
        [item],
        view="week",
        anchor=parse_anchor("2026-07-27"),
        timezone_name="Asia/Shanghai",
    )

    assert utc_day.day is not None
    assert utc_day.day.items == []
    assert local_day.day is not None
    assert [row.id for row in local_day.day.items] == ["timezone-boundary"]
    assert len(week.weeks[0].segments) == 1
    assert week.weeks[0].segments[0].col_start == 2


def test_build_calendar_treats_end_at_exact_midnight_as_exclusive():
    item = _item(
        id="midnight-exclusive",
        start_at=datetime(2026, 7, 26, 16, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 7, 27, 16, 0, tzinfo=timezone.utc),
    )

    first_day = build_calendar_view(
        [item],
        view="day",
        anchor=parse_anchor("2026-07-27"),
        timezone_name="Asia/Shanghai",
    )
    exclusive_end_day = build_calendar_view(
        [item],
        view="day",
        anchor=parse_anchor("2026-07-28"),
        timezone_name="Asia/Shanghai",
    )

    assert first_day.day is not None
    assert [row.id for row in first_day.day.items] == ["midnight-exclusive"]
    assert exclusive_end_day.day is not None
    assert exclusive_end_day.day.items == []


def test_build_calendar_includes_both_local_days_when_task_crosses_midnight():
    item = _item(
        id="cross-midnight",
        start_at=datetime(2026, 7, 27, 15, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 7, 27, 17, 0, tzinfo=timezone.utc),
    )

    week = build_calendar_view(
        [item],
        view="week",
        anchor=parse_anchor("2026-07-27"),
        timezone_name="Asia/Shanghai",
    )

    assert len(week.weeks[0].segments) == 1
    assert week.weeks[0].segments[0].col_start == 2
    assert week.weeks[0].segments[0].col_span == 2


def test_build_calendar_treats_naive_datetimes_as_utc():
    item = _item(
        id="naive-utc",
        start_at=datetime(2026, 7, 26, 18, 0),
        end_at=datetime(2026, 7, 26, 19, 0),
    )

    view = build_calendar_view(
        [item],
        view="day",
        anchor=parse_anchor("2026-07-27"),
        timezone_name="Asia/Shanghai",
    )

    assert view.day is not None
    assert [row.id for row in view.day.items] == ["naive-utc"]


def test_build_calendar_rejects_invalid_timezone():
    with pytest.raises(ValueError, match="invalid timezone"):
        build_calendar_view(
            [_item()],
            view="day",
            anchor=parse_anchor("2026-06-11"),
            timezone_name="Mars/Olympus_Mons",
        )


def test_calendar_month_lanes_order_by_status_then_time_then_priority():
    day = datetime(2026, 6, 15, tzinfo=timezone.utc)
    items = [
        _item(
            id="archived",
            status="archived",
            priority="4",
            start_at=day.replace(hour=8),
            end_at=day.replace(hour=9),
        ),
        _item(
            id="done",
            status="done",
            priority="4",
            start_at=day.replace(hour=8),
            end_at=day.replace(hour=9),
        ),
        _item(
            id="doing-late",
            status="doing",
            priority="4",
            start_at=day.replace(hour=11),
            end_at=day.replace(hour=12),
        ),
        _item(
            id="doing-early-low",
            status="doing",
            priority="1",
            start_at=day.replace(hour=9),
            end_at=day.replace(hour=10),
        ),
        _item(
            id="doing-early-high",
            status="doing",
            priority="4",
            start_at=day.replace(hour=9),
            end_at=day.replace(hour=10),
        ),
        _item(
            id="todo",
            status="todo",
            priority="1",
            start_at=day.replace(hour=16),
            end_at=day.replace(hour=17),
        ),
    ]
    view = build_calendar_view(
        items,
        view="month",
        anchor=parse_anchor("2026-06-15"),
        timezone_name="UTC",
    )
    lanes = {
        seg.item.id: seg.lane
        for week in view.weeks
        for seg in week.segments
    }
    assert lanes["todo"] < lanes["doing-early-high"]
    assert lanes["doing-early-high"] < lanes["doing-early-low"]
    assert lanes["doing-early-low"] < lanes["doing-late"]
    assert lanes["doing-late"] < lanes["done"]
    assert lanes["done"] < lanes["archived"]


def test_calendar_day_items_order_by_status_then_time_then_priority():
    day = datetime(2026, 6, 15, tzinfo=timezone.utc)
    items = [
        _item(
            id="archived",
            status="archived",
            priority="4",
            start_at=day.replace(hour=8),
            end_at=day.replace(hour=9),
        ),
        _item(
            id="done",
            status="done",
            priority="4",
            start_at=day.replace(hour=8),
            end_at=day.replace(hour=9),
        ),
        _item(
            id="doing-late",
            status="doing",
            priority="4",
            start_at=day.replace(hour=11),
            end_at=day.replace(hour=12),
        ),
        _item(
            id="doing-early-low",
            status="doing",
            priority="1",
            start_at=day.replace(hour=9),
            end_at=day.replace(hour=10),
        ),
        _item(
            id="doing-early-high",
            status="doing",
            priority="4",
            start_at=day.replace(hour=9),
            end_at=day.replace(hour=10),
        ),
        _item(
            id="todo",
            status="todo",
            priority="1",
            start_at=day.replace(hour=16),
            end_at=day.replace(hour=17),
        ),
    ]
    view = build_calendar_view(
        items,
        view="day",
        anchor=parse_anchor("2026-06-15"),
        timezone_name="UTC",
    )
    assert view.day is not None
    assert [row.id for row in view.day.items] == [
        "todo",
        "doing-early-high",
        "doing-early-low",
        "doing-late",
        "done",
        "archived",
    ]


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


def test_build_undated_view_lists_only_tasks_missing_both_times():
    undated = _item(id="undated", start_at=None, end_at=None)
    start_only = _item(id="start-only", start_at=datetime(2026, 6, 11, 9, 0, tzinfo=timezone.utc), end_at=None)
    end_only = _item(id="end-only", start_at=None, end_at=datetime(2026, 6, 11, 18, 0, tzinfo=timezone.utc))
    dated = _item(id="dated")

    view = build_undated_view([undated, start_only, end_only, dated])
    assert [item.id for item in view.items] == ["undated"]


def test_build_undated_view_for_project_scope_excludes_other_projects():
    this_undated = _item(id="this-undated", project_id="p1", start_at=None, end_at=None)
    other_undated = _item(id="other-undated", project_id="p2", start_at=None, end_at=None)
    this_dated = _item(id="this-dated", project_id="p1")
    # list_schedule_items(project) already scopes rows; compose the same way here.
    scoped = [item for item in [this_undated, other_undated, this_dated] if item.project_id == "p1"]
    view = build_undated_view(scoped)
    assert [item.id for item in view.items] == ["this-undated"]


def test_build_calendar_excludes_undated_tasks():
    undated = _item(id="undated", start_at=None, end_at=None)
    dated = _item(id="dated")
    view = build_calendar_view([undated, dated], view="day", anchor=parse_anchor("2026-06-11"))
    assert view.day is not None
    assert [item.id for item in view.day.items] == ["dated"]
    week = build_calendar_view([undated, dated], view="week", anchor=parse_anchor("2026-06-11"))
    assert all(seg.item.id != "undated" for week_out in week.weeks for seg in week_out.segments)


def test_build_overdue_view_uses_calendar_day_cutoff_in_timezone():
    now = datetime(2026, 8, 17, 3, 0, tzinfo=timezone.utc)  # 11:00 in Asia/Shanghai
    yesterday = _item(
        id="yesterday",
        status="todo",
        start_at=datetime(2026, 8, 16, 7, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 8, 16, 7, 0, tzinfo=timezone.utc),
    )
    today_local = _item(
        id="today",
        status="doing",
        start_at=datetime(2026, 8, 16, 16, 0, tzinfo=timezone.utc),  # 2026-08-17 00:00 +08
        end_at=datetime(2026, 8, 16, 17, 0, tzinfo=timezone.utc),
    )
    start_only_yesterday = _item(
        id="start-only",
        status="todo",
        start_at=datetime(2026, 8, 16, 8, 0, tzinfo=timezone.utc),
        end_at=None,
    )
    untimed = _item(id="untimed", status="todo", start_at=None, end_at=None)
    done_yesterday = _item(
        id="done",
        status="done",
        start_at=datetime(2026, 8, 16, 7, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 8, 16, 7, 0, tzinfo=timezone.utc),
    )

    view = build_overdue_view(
        [today_local, yesterday, start_only_yesterday, untimed, done_yesterday],
        timezone_name="Asia/Shanghai",
        now=now,
    )
    assert [item.id for item in view.items] == ["yesterday", "start-only"]
    assert view.total == 2
    assert view.has_more is False


def test_build_overdue_view_pages_oldest_deadline_first():
    now = datetime(2026, 8, 17, 3, 0, tzinfo=timezone.utc)
    items = [
        _item(
            id=f"overdue-{index}",
            status="todo" if index % 2 == 0 else "doing",
            start_at=datetime(2026, 8, 10 + index, 7, 0, tzinfo=timezone.utc),
            end_at=datetime(2026, 8, 10 + index, 8, 0, tzinfo=timezone.utc),
        )
        for index in range(6)
    ]

    first_page = build_overdue_view(
        items,
        timezone_name="Asia/Shanghai",
        now=now,
        limit=2,
        offset=0,
    )
    assert [item.id for item in first_page.items] == ["overdue-0", "overdue-1"]
    assert first_page.total == 6
    assert first_page.has_more is True

    last_page = build_overdue_view(
        items,
        timezone_name="Asia/Shanghai",
        now=now,
        limit=2,
        offset=4,
    )
    assert [item.id for item in last_page.items] == ["overdue-4", "overdue-5"]
    assert last_page.has_more is False
