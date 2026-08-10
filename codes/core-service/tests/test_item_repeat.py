"""Tests for the repeat-occurrence materialization helper.

The helper is a pure function over datetimes so we can exercise the full
calendar rule set (daily/weekly/monthly, cross-day duration, month-end
roll-forward) without a database.
"""

from datetime import datetime, timedelta, timezone

from app.services.item_api import materialize_repeat_occurrences


UTC = timezone.utc


def _dt(year, month, day, hour=9, minute=0):
    return datetime(year, month, day, hour, minute, tzinfo=UTC)


# --- guard clauses ---------------------------------------------------------


def test_none_repeat_returns_empty():
    start = _dt(2026, 8, 10)
    assert materialize_repeat_occurrences(start_at=start, end_at=None, repeat="none") == []


def test_invalid_repeat_returns_empty():
    start = _dt(2026, 8, 10)
    assert materialize_repeat_occurrences(start_at=start, end_at=None, repeat="yearly") == []


def test_none_start_returns_empty():
    assert materialize_repeat_occurrences(start_at=None, end_at=None, repeat="daily") == []


# --- daily ------------------------------------------------------------------


def test_daily_remaining_week_from_monday():
    # 2026-08-10 is a Monday (verified by weekday == 0). Expect Tue..Sun.
    start = _dt(2026, 8, 10)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="daily")
    assert [d.date().isoformat() for d, _ in out] == [
        "2026-08-11",
        "2026-08-12",
        "2026-08-13",
        "2026-08-14",
        "2026-08-15",
        "2026-08-16",
    ]


def test_daily_from_sunday_is_empty():
    # 2026-08-16 is a Sunday → no remaining days in same Mon-Sun week.
    start = _dt(2026, 8, 16)
    assert materialize_repeat_occurrences(start_at=start, end_at=None, repeat="daily") == []


def test_daily_preserves_time_of_day():
    start = _dt(2026, 8, 10, hour=9, minute=30)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="daily")
    for s, _ in out:
        assert (s.hour, s.minute) == (9, 30)


# --- weekly -----------------------------------------------------------------


def test_weekly_in_same_month():
    # 2026-08 Mondays: 8/3, 8/10, 8/17, 8/24, 8/31. After 8/10 → 17, 24, 31.
    start = _dt(2026, 8, 10)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="weekly")
    assert [d.date().isoformat() for d, _ in out] == [
        "2026-08-17",
        "2026-08-24",
        "2026-08-31",
    ]


def test_weekly_from_last_occurrence_in_month():
    # 2026-08-31 is the last Monday of August → no further in-month Mondays.
    start = _dt(2026, 8, 31)
    assert materialize_repeat_occurrences(start_at=start, end_at=None, repeat="weekly") == []


def test_weekly_preserves_time_of_day():
    start = _dt(2026, 8, 10, hour=14, minute=15)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="weekly")
    for s, _ in out:
        assert (s.hour, s.minute) == (14, 15)


# --- monthly ----------------------------------------------------------------


def test_monthly_remaining_year_simple():
    start = _dt(2026, 8, 10)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="monthly")
    assert [d.date().isoformat() for d, _ in out] == [
        "2026-09-10",
        "2026-10-10",
        "2026-11-10",
        "2026-12-10",
    ]


def test_monthly_from_december_is_empty():
    start = _dt(2026, 12, 10)
    assert materialize_repeat_occurrences(start_at=start, end_at=None, repeat="monthly") == []


def test_monthly_rolls_forward_for_short_months():
    # 1/31 has no equivalent day in shorter months → use last day of month.
    # 2026 is not a leap year → Feb 2026 ends on the 28th.
    start = _dt(2026, 1, 31)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="monthly")
    assert [d.date().isoformat() for d, _ in out] == [
        "2026-02-28",  # 2026 is non-leap
        "2026-03-31",
        "2026-04-30",
        "2026-05-31",
        "2026-06-30",
        "2026-07-31",
        "2026-08-31",
        "2026-09-30",
        "2026-10-31",
        "2026-11-30",
        "2026-12-31",
    ]


def test_monthly_rolls_forward_leap_year_february():
    # 2024 is a leap year → Feb has 29 days.
    start = _dt(2024, 1, 31)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="monthly")
    assert [d.date().isoformat() for d, _ in out][0] == "2024-02-29"


def test_monthly_preserves_time_of_day():
    start = _dt(2026, 8, 10, hour=7, minute=45)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="monthly")
    for s, _ in out:
        assert (s.hour, s.minute) == (7, 45)


# --- cross-day duration preservation ----------------------------------------


def test_daily_cross_day_duration_is_preserved():
    # 8/10 22:00 → 8/12 06:00 is 1d 8h. Copies should keep that exact offset.
    start = _dt(2026, 8, 10, hour=22, minute=0)
    end = _dt(2026, 8, 12, hour=6, minute=0)
    out = materialize_repeat_occurrences(start_at=start, end_at=end, repeat="daily")
    expected_end = end - start
    for s, e in out:
        assert e is not None
        assert e - s == expected_end


def test_weekly_cross_day_duration_is_preserved():
    start = _dt(2026, 8, 10, hour=22, minute=0)
    end = _dt(2026, 8, 12, hour=6, minute=0)
    out = materialize_repeat_occurrences(start_at=start, end_at=end, repeat="weekly")
    assert out
    for s, e in out:
        assert e is not None
        assert (e - s) == timedelta(days=1, hours=8)


def test_monthly_cross_day_duration_is_preserved():
    # 1/31 22:00 → 2/2 06:00 spans 32h (2 calendar days minus 16h offset).
    start = _dt(2026, 1, 31, hour=22, minute=0)
    end = _dt(2026, 2, 2, hour=6, minute=0)
    duration = end - start
    assert duration == timedelta(hours=32)
    out = materialize_repeat_occurrences(start_at=start, end_at=end, repeat="monthly")
    assert out
    for s, e in out:
        assert e is not None
        assert (e - s) == duration


# --- timezone preservation --------------------------------------------------


def test_preserves_aware_timezone():
    tz = timezone(timedelta(hours=8))  # Asia/Shanghai-like fixed offset
    start = datetime(2026, 8, 10, 9, 0, tzinfo=tz)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="daily")
    assert out
    for s, _ in out:
        assert s.tzinfo == tz


def test_naive_datetime_stays_naive():
    start = datetime(2026, 8, 10, 9, 0)
    out = materialize_repeat_occurrences(start_at=start, end_at=None, repeat="daily")
    assert out
    for s, _ in out:
        assert s.tzinfo is None
