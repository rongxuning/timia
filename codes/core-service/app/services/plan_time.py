from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

SLOT_LIMITS = {"day": 20, "week": 50, "month": 80, "year": 100}


def resolve_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError("invalid timezone") from error


def sunday_week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


def current_period_start(period_kind: str, now: datetime, timezone_name: str) -> date:
    local = now.astimezone(resolve_timezone(timezone_name)).date()
    if period_kind == "day":
        return local
    if period_kind == "week":
        return sunday_week_start(local)
    if period_kind == "month":
        return date(local.year, local.month, 1)
    if period_kind == "year":
        return date(local.year, 1, 1)
    raise ValueError("invalid period_kind")


def next_period_start(period_kind: str, period_start: date) -> date:
    if period_kind == "day":
        return period_start + timedelta(days=1)
    if period_kind == "week":
        return period_start + timedelta(days=7)
    if period_kind == "month":
        y, m = period_start.year, period_start.month + 1
        if m == 13:
            y, m = y + 1, 1
        return date(y, m, 1)
    if period_kind == "year":
        return date(period_start.year + 1, 1, 1)
    raise ValueError("invalid period_kind")


def period_end_date(period_kind: str, period_start: date) -> date:
    return next_period_start(period_kind, period_start) - timedelta(days=1)


def resolve_slot_bounds(
    *,
    period_kind: str,
    period_start: date,
    rel_month: int | None,
    rel_day: int,
    start_minute: int,
    end_minute: int,
    all_day: bool,
    timezone_name: str,
) -> tuple[datetime, datetime] | None:
    tz = resolve_timezone(timezone_name)
    if period_kind == "day":
        day = period_start
    elif period_kind == "week":
        if rel_day < 0 or rel_day > 6:
            return None
        day = period_start + timedelta(days=rel_day)
    elif period_kind == "month":
        last = monthrange(period_start.year, period_start.month)[1]
        if rel_day < 1 or rel_day > last:
            return None
        day = date(period_start.year, period_start.month, rel_day)
    elif period_kind == "year":
        if rel_month is None or rel_month < 1 or rel_month > 12:
            return None
        last = monthrange(period_start.year, rel_month)[1]
        if rel_day < 1 or rel_day > last:
            return None
        day = date(period_start.year, rel_month, rel_day)
    else:
        raise ValueError("invalid period_kind")

    if all_day:
        start = datetime.combine(day, time.min, tzinfo=tz)
        end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
        return start, end
    if not (0 <= start_minute < end_minute <= 1440):
        return None
    start = datetime.combine(day, time.min, tzinfo=tz) + timedelta(minutes=start_minute)
    end = datetime.combine(day, time.min, tzinfo=tz) + timedelta(minutes=end_minute)
    return start, end


def reminder_open_at(period_start: date, timezone_name: str) -> datetime:
    tz = resolve_timezone(timezone_name)
    return datetime.combine(period_start - timedelta(days=1), time(20, 0), tzinfo=tz)


def reminder_has_started(period_start: date, now: datetime, timezone_name: str) -> bool:
    local = now.astimezone(resolve_timezone(timezone_name))
    return local >= reminder_open_at(period_start, timezone_name)


def in_reminder_window(period_start: date, now: datetime, timezone_name: str) -> bool:
    """True from D-1 20:00 onward (opening gate, no longer a same-day-only window)."""
    return reminder_has_started(period_start, now, timezone_name)


def pending_should_expire(
    period_kind: str, period_start: date, now: datetime, timezone_name: str
) -> bool:
    local = now.astimezone(resolve_timezone(timezone_name)).date()
    return local > period_end_date(period_kind, period_start)


def upcoming_period_start(
    period_kind: str,
    now: datetime,
    timezone_name: str,
    existing_period_starts: set[date],
) -> date | None:
    """Latest period whose reminder has opened and is not occupied; else None."""
    current = current_period_start(period_kind, now, timezone_name)
    candidate = current
    nxt = next_period_start(period_kind, candidate)
    while reminder_has_started(nxt, now, timezone_name):
        candidate = nxt
        nxt = next_period_start(period_kind, candidate)
    while candidate in existing_period_starts:
        nxt = next_period_start(period_kind, candidate)
        if not reminder_has_started(nxt, now, timezone_name):
            return None
        candidate = nxt
    if not reminder_has_started(candidate, now, timezone_name):
        return None
    return candidate
