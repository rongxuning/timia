from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.services.plan_time import (
    current_period_start,
    in_reminder_window,
    pending_should_expire,
    period_overlaps_any,
    reminder_has_started,
    resolve_slot_bounds,
    upcoming_period_start,
)
from app.services.week_calendar import MONDAY, SATURDAY, SUNDAY

SH = "Asia/Shanghai"


def test_current_period_start_week_defaults_to_monday():
    now = datetime(2026, 8, 19, 15, 0, tzinfo=ZoneInfo(SH))
    assert current_period_start("day", now, SH) == date(2026, 8, 19)
    assert current_period_start("week", now, SH) == date(2026, 8, 17)
    assert current_period_start("week", now, SH, week_starts_on=SUNDAY) == date(2026, 8, 16)
    assert current_period_start("week", now, SH, week_starts_on=SATURDAY) == date(2026, 8, 15)
    assert current_period_start("month", now, SH) == date(2026, 8, 1)
    assert current_period_start("year", now, SH) == date(2026, 1, 1)


def test_week_slot_maps_monday_morning_from_monday_anchor():
    start, end = resolve_slot_bounds(
        period_kind="week",
        period_start=date(2026, 8, 17),
        rel_month=None,
        rel_day=MONDAY,
        start_minute=9 * 60,
        end_minute=10 * 60,
        all_day=False,
        timezone_name=SH,
        week_starts_on=MONDAY,
    )
    assert start.isoformat() == "2026-08-17T09:00:00+08:00"
    assert end.isoformat() == "2026-08-17T10:00:00+08:00"


def test_week_slot_sunday_stays_sunday_when_anchor_is_sunday():
    start, end = resolve_slot_bounds(
        period_kind="week",
        period_start=date(2026, 8, 16),
        rel_month=None,
        rel_day=SUNDAY,
        start_minute=9 * 60,
        end_minute=10 * 60,
        all_day=False,
        timezone_name=SH,
        week_starts_on=SUNDAY,
    )
    assert start.isoformat() == "2026-08-16T09:00:00+08:00"
    assert end.isoformat() == "2026-08-16T10:00:00+08:00"


def test_month_slot_skips_february_31():
    assert (
        resolve_slot_bounds(
            period_kind="month",
            period_start=date(2026, 2, 1),
            rel_month=None,
            rel_day=31,
            start_minute=0,
            end_minute=60,
            all_day=False,
            timezone_name=SH,
        )
        is None
    )


def test_reminder_window_is_previous_local_day_from_20():
    period_start = date(2026, 8, 23)  # next Sunday
    before = datetime(2026, 8, 22, 19, 59, tzinfo=ZoneInfo(SH))
    at = datetime(2026, 8, 22, 20, 0, tzinfo=ZoneInfo(SH))
    later = datetime(2026, 8, 24, 10, 0, tzinfo=ZoneInfo(SH))
    assert in_reminder_window(period_start, before, SH) is False
    assert in_reminder_window(period_start, at, SH) is True
    assert reminder_has_started(period_start, later, SH) is True


def test_pending_expires_after_period_end():
    assert pending_should_expire(
        "week",
        date(2026, 8, 16),
        datetime(2026, 8, 23, 0, 1, tzinfo=ZoneInfo(SH)),
        SH,
    )
    assert not pending_should_expire(
        "week",
        date(2026, 8, 16),
        datetime(2026, 8, 22, 23, 0, tzinfo=ZoneInfo(SH)),
        SH,
    )


def test_upcoming_skips_period_starts_that_already_have_runs():
    midweek = datetime(2026, 8, 19, 15, 0, tzinfo=ZoneInfo(SH))
    assert (
        upcoming_period_start(
            "week", midweek, SH, {date(2026, 8, 16)}, week_starts_on=SUNDAY
        )
        is None
    )

    opening = datetime(2026, 8, 22, 20, 0, tzinfo=ZoneInfo(SH))
    assert upcoming_period_start(
        "week", opening, SH, {date(2026, 8, 16)}, week_starts_on=SUNDAY
    ) == date(2026, 8, 23)

    monday = datetime(2026, 8, 24, 10, 0, tzinfo=ZoneInfo(SH))
    assert upcoming_period_start(
        "week", monday, SH, {date(2026, 8, 16)}, week_starts_on=SUNDAY
    ) == date(2026, 8, 23)

    next_opening = datetime(2026, 8, 29, 20, 0, tzinfo=ZoneInfo(SH))
    assert upcoming_period_start(
        "week", next_opening, SH, {date(2026, 8, 16)}, week_starts_on=SUNDAY
    ) == date(2026, 8, 30)
    assert upcoming_period_start(
        "week",
        next_opening,
        SH,
        {date(2026, 8, 16), date(2026, 8, 23)},
        week_starts_on=SUNDAY,
    ) == date(2026, 8, 30)


def test_upcoming_skips_monday_week_that_overlaps_applied_sunday_week():
    wednesday = datetime(2026, 8, 19, 15, 0, tzinfo=ZoneInfo(SH))
    assert period_overlaps_any("week", date(2026, 8, 17), {date(2026, 8, 16)})
    assert (
        upcoming_period_start(
            "week",
            wednesday,
            SH,
            set(),
            week_starts_on=MONDAY,
            applied_period_starts={date(2026, 8, 16)},
        )
        is None
    )
