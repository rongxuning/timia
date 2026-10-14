from datetime import date

import pytest

from app.services.week_calendar import (
    DEFAULT_WEEK_START,
    MONDAY,
    SATURDAY,
    SUNDAY,
    week_slot_offset,
    week_start,
    weekday_number,
)


def test_weekday_number_is_monday_through_sunday():
    assert weekday_number(date(2026, 10, 12)) == MONDAY
    assert weekday_number(date(2026, 10, 14)) == 3
    assert weekday_number(date(2026, 10, 17)) == SATURDAY
    assert weekday_number(date(2026, 10, 18)) == SUNDAY


def test_default_week_start_is_monday():
    assert DEFAULT_WEEK_START == MONDAY
    assert week_start(date(2026, 10, 14)) == date(2026, 10, 12)


def test_week_start_sunday_and_saturday():
    wednesday = date(2026, 10, 14)
    assert week_start(wednesday, SUNDAY) == date(2026, 10, 11)
    assert week_start(wednesday, SATURDAY) == date(2026, 10, 10)


def test_week_slot_keeps_weekday_inside_any_start():
    assert week_slot_offset(MONDAY, MONDAY) == 0
    assert week_slot_offset(SUNDAY, MONDAY) == 6
    assert week_slot_offset(MONDAY, SUNDAY) == 1
    assert week_slot_offset(SUNDAY, SATURDAY) == 1
    assert week_slot_offset(SATURDAY, SATURDAY) == 0


def test_week_start_rejects_midweek_values():
    with pytest.raises(ValueError, match="invalid_week_start"):
        week_start(date(2026, 10, 14), 3)
