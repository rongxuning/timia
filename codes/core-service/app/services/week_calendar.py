"""Weekday numbers are 1=Monday through 7=Sunday.

Account and template week starts use the same numbers, limited to Monday, Saturday, and Sunday.
"""

from datetime import date, timedelta

MONDAY = 1
SATURDAY = 6
SUNDAY = 7
WEEK_START_DAYS = frozenset({MONDAY, SATURDAY, SUNDAY})
DEFAULT_WEEK_START = MONDAY


def weekday_number(d: date) -> int:
    """Return 1 for Monday through 7 for Sunday."""
    return d.weekday() + 1


def require_week_start(starts_on: int) -> int:
    if starts_on not in WEEK_START_DAYS:
        raise ValueError("invalid_week_start")
    return starts_on


def week_start(d: date, starts_on: int = DEFAULT_WEEK_START) -> date:
    """First day of the week that contains ``d``."""
    anchor = require_week_start(starts_on)
    delta = (weekday_number(d) - anchor) % 7
    return d - timedelta(days=delta)


def week_slot_offset(rel_day: int, starts_on: int) -> int:
    """Days from a week anchor to absolute weekday ``rel_day`` (1=Monday … 7=Sunday)."""
    require_week_start(starts_on)
    return (rel_day - starts_on) % 7
