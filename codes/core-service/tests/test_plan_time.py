from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.services.plan_time import (
    current_period_start,
    in_reminder_window,
    pending_should_expire,
    resolve_slot_bounds,
    sunday_week_start,
    upcoming_period_start,
)

SH = "Asia/Shanghai"


def test_sunday_week_start_from_wednesday():
    # 2026-08-19 is Wednesday; week starts 2026-08-16 (Sunday)
    assert sunday_week_start(date(2026, 8, 19)) == date(2026, 8, 16)


def test_current_period_start_week_and_month():
    now = datetime(2026, 8, 19, 15, 0, tzinfo=ZoneInfo(SH))
    assert current_period_start("day", now, SH) == date(2026, 8, 19)
    assert current_period_start("week", now, SH) == date(2026, 8, 16)
    assert current_period_start("month", now, SH) == date(2026, 8, 1)
    assert current_period_start("year", now, SH) == date(2026, 1, 1)


def test_week_slot_maps_monday_morning():
    # rel_day 1 = Monday of week starting Sunday 2026-08-16 → 2026-08-17 09:00-10:00 CST
    start, end = resolve_slot_bounds(
        period_kind="week",
        period_start=date(2026, 8, 16),
        rel_month=None,
        rel_day=1,
        start_minute=9 * 60,
        end_minute=10 * 60,
        all_day=False,
        timezone_name=SH,
    )
    assert start.isoformat() == "2026-08-17T09:00:00+08:00"
    assert end.isoformat() == "2026-08-17T10:00:00+08:00"


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
    assert in_reminder_window(period_start, before, SH) is False
    assert in_reminder_window(period_start, at, SH) is True


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
    now = datetime(2026, 8, 19, 15, 0, tzinfo=ZoneInfo(SH))
    # current week 2026-08-16 already applied; next is 2026-08-23
    d = upcoming_period_start("week", now, SH, {date(2026, 8, 16)})
    assert d == date(2026, 8, 23)
    # if next week already skipped/applied, walk to 2026-08-30
    d2 = upcoming_period_start("week", now, SH, {date(2026, 8, 16), date(2026, 8, 23)})
    assert d2 == date(2026, 8, 30)
