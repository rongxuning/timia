from datetime import datetime, timezone

from app.schemas.views.schedule import ScheduleTaskItemOut
from app.services.views.schedule_map import build_map_view, parse_map_statuses


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
        "location": "店",
        "location_lat": 39.9,
        "location_lng": 116.3,
        "workspace_id": "w1",
        "workspace_name": "WS",
        "project_id": "p1",
        "project_name": "Proj",
    }
    base.update(kwargs)
    return ScheduleTaskItemOut(**base)


def test_parse_map_statuses_defaults_to_active():
    assert parse_map_statuses(None) == ("todo", "doing")


def test_parse_map_statuses_rejects_unknown():
    try:
        parse_map_statuses(["todo", "nope"])
    except ValueError as error:
        assert str(error) == "invalid_status"
    else:
        raise AssertionError("expected invalid_status")


def test_build_map_view_drops_items_without_coords_and_archived_by_default():
    items = [
        _item(id="named", location="线上", location_lat=None, location_lng=None),
        _item(id="archived", status="archived"),
        _item(id="todo-pin"),
        _item(
            id="later",
            start_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
        ),
    ]
    view = build_map_view(items, statuses=("todo", "doing"))
    assert [row.id for row in view.items] == ["later", "todo-pin"]
    assert view.total == 2
    assert view.truncated is False


def test_build_map_view_filters_workspace_and_truncates():
    items = [
        _item(id=f"i{i}", workspace_id="w1") for i in range(3)
    ] + [_item(id="other", workspace_id="w2")]
    view = build_map_view(items, statuses=("todo", "doing"), workspace_id="w1", limit=2)
    assert len(view.items) == 2
    assert view.total == 3
    assert view.truncated is True
