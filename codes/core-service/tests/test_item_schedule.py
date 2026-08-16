from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.services.item_api import validate_item_schedule_range, validate_undated_item_status


START = datetime(2026, 8, 17, 9, 0, tzinfo=timezone.utc)
END = datetime(2026, 8, 17, 10, 0, tzinfo=timezone.utc)


def test_allows_both_start_and_end_missing():
    validate_item_schedule_range(None, None)


def test_allows_start_only():
    validate_item_schedule_range(START, None)


def test_allows_end_only():
    validate_item_schedule_range(None, END)


def test_allows_end_equal_to_start():
    validate_item_schedule_range(START, START)


def test_allows_end_after_start():
    validate_item_schedule_range(START, END)


def test_rejects_end_before_start():
    with pytest.raises(HTTPException) as exc:
        validate_item_schedule_range(END, START)
    assert exc.value.status_code == 400
    assert exc.value.detail == "invalid_time_range"


def test_allows_undated_todo_status():
    validate_undated_item_status(None, None, "todo")


def test_allows_dated_non_todo_status():
    validate_undated_item_status(START, END, "doing")
    validate_undated_item_status(START, None, "done")
    validate_undated_item_status(None, END, "archived")


def test_rejects_undated_non_todo_status():
    with pytest.raises(HTTPException) as exc:
        validate_undated_item_status(None, None, "doing")
    assert exc.value.status_code == 400
    assert exc.value.detail == "undated_requires_todo"
