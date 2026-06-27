"""Calendar / swimlane / priority layout for schedule view APIs."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal

from app.schemas.views.schedule import (
    CalendarDayDetailOut,
    CalendarDayOut,
    CalendarSegmentOut,
    CalendarWeekOut,
    ScheduleCalendarViewOut,
    SchedulePriorityViewOut,
    ScheduleSwimlaneViewOut,
    ScheduleTaskItemOut,
)

STATUS_KEYS = ("todo", "doing", "done", "archived")
PRIORITY_KEYS = ("1", "2", "3", "4")
CalendarViewKind = Literal["month", "week", "day"]


def _pad2(n: int) -> str:
    return f"{n:02d}"


def _day_key(d: date) -> str:
    return f"{d.year}-{_pad2(d.month)}-{_pad2(d.day)}"


def _whole_days_between_inclusive(a: date, b: date) -> int:
    return (a - b).days


def _sunday_week_start(d: date) -> date:
    """Week starts on Sunday (align with JS Date.getDay())."""
    return d - timedelta(days=(d.weekday() + 1) % 7)


def normalize_priority(p: str | None) -> str:
    v = (p or "").strip().lower()
    if v in PRIORITY_KEYS:
        return v
    if v == "low":
        return "2"
    if v == "medium":
        return "3"
    if v == "high":
        return "4"
    return "1"


def _local_day_range_from_item(it: ScheduleTaskItemOut) -> tuple[str, str] | None:
    if not it.start_at:
        return None
    s = it.start_at
    if isinstance(s, datetime):
        s_date = s.date()
    else:
        return None
    e = it.end_at.date() if it.end_at else s_date
    if e < s_date:
        k = _day_key(s_date)
        return k, k
    return _day_key(s_date), _day_key(e)


def _item_covers_day(it: ScheduleTaskItemOut, day: date) -> bool:
    range_keys = _local_day_range_from_item(it)
    if not range_keys:
        return False
    start = date.fromisoformat(range_keys[0])
    end = date.fromisoformat(range_keys[1])
    return start <= day <= end


def _build_week_days(week_start: date, *, in_month: int | None = None) -> list[CalendarDayOut]:
    days: list[CalendarDayOut] = []
    for d in range(7):
        current = week_start + timedelta(days=d)
        days.append(
            CalendarDayOut(
                key=_day_key(current),
                day=current.day,
                in_month=current.month == in_month if in_month is not None else True,
            )
        )
    return days


def _build_week_segments(
    items: list[ScheduleTaskItemOut],
    week_first_date: date,
    week_last_date: date,
) -> list[CalendarSegmentOut]:
    raw_segments: list[dict] = []

    for it in items:
        range_keys = _local_day_range_from_item(it)
        if not range_keys or not it.start_at:
            continue
        s = it.start_at
        e = it.end_at or it.start_at
        task_start = s.date()
        task_end = e.date()
        if task_end < task_start:
            continue
        if task_end < week_first_date or task_start > week_last_date:
            continue

        seg_start = week_first_date if task_start < week_first_date else task_start
        seg_end = week_last_date if task_end > week_last_date else task_end
        if seg_start > seg_end:
            continue

        col_start = _whole_days_between_inclusive(seg_start, week_first_date) + 1
        col_span = _whole_days_between_inclusive(seg_end, seg_start) + 1

        raw_segments.append(
            {
                "item": it,
                "col_start": col_start,
                "col_span": col_span,
                "round_left": _day_key(seg_start) == range_keys[0],
                "round_right": _day_key(seg_end) == range_keys[1],
            }
        )

    raw_segments.sort(key=lambda x: (x["col_start"], -x["col_span"]))

    lanes: list[list[tuple[int, int]]] = []
    segments: list[CalendarSegmentOut] = []

    for raw in raw_segments:
        cs = raw["col_start"]
        ce = raw["col_start"] + raw["col_span"] - 1
        placed = False
        for lane_idx in range(24):
            occupied = lanes[lane_idx] if lane_idx < len(lanes) else []
            conflict = any(not (r_e < cs or r_s > ce) for r_s, r_e in occupied)
            if not conflict:
                if lane_idx >= len(lanes):
                    lanes.append([])
                lanes[lane_idx].append((cs, ce))
                segments.append(
                    CalendarSegmentOut(
                        item=raw["item"],
                        col_start=raw["col_start"],
                        col_span=raw["col_span"],
                        lane=lane_idx,
                        round_left=raw["round_left"],
                        round_right=raw["round_right"],
                    )
                )
                placed = True
                break
        if not placed:
            lane_idx = len(lanes)
            lanes.append([(cs, ce)])
            segments.append(
                CalendarSegmentOut(
                    item=raw["item"],
                    col_start=raw["col_start"],
                    col_span=raw["col_span"],
                    lane=lane_idx,
                    round_left=raw["round_left"],
                    round_right=raw["round_right"],
                )
            )

    return segments


def _build_week_out(
    items: list[ScheduleTaskItemOut],
    week_start: date,
    *,
    in_month: int | None = None,
) -> CalendarWeekOut:
    week_days = _build_week_days(week_start, in_month=in_month)
    week_first_date = date.fromisoformat(week_days[0].key)
    week_last_date = date.fromisoformat(week_days[6].key)
    segments = _build_week_segments(items, week_first_date, week_last_date)
    return CalendarWeekOut(days=week_days, segments=segments)


def _build_month_weeks(items: list[ScheduleTaskItemOut], year: int, month: int) -> list[CalendarWeekOut]:
    first = date(year, month, 1)
    grid_start = _sunday_week_start(first)
    weeks: list[CalendarWeekOut] = []
    for w in range(5):
        week_start = grid_start + timedelta(days=w * 7)
        weeks.append(_build_week_out(items, week_start, in_month=month))
    return weeks


def _build_day_detail(items: list[ScheduleTaskItemOut], day: date) -> CalendarDayDetailOut:
    day_items = [it for it in items if _item_covers_day(it, day)]
    day_items.sort(
        key=lambda x: (
            x.start_at.timestamp() if x.start_at else 0,
            x.title or "",
        )
    )
    weekday = (day.weekday() + 1) % 7
    return CalendarDayDetailOut(key=_day_key(day), weekday=weekday, items=day_items)


def build_calendar_view(
    items: list[ScheduleTaskItemOut],
    *,
    view: CalendarViewKind = "month",
    anchor: date,
) -> ScheduleCalendarViewOut:
    anchor_key = _day_key(anchor)

    if view == "day":
        return ScheduleCalendarViewOut(
            view="day",
            anchor=anchor_key,
            month=None,
            weeks=[],
            day=_build_day_detail(items, anchor),
        )

    if view == "week":
        week_start = _sunday_week_start(anchor)
        return ScheduleCalendarViewOut(
            view="week",
            anchor=anchor_key,
            month=f"{anchor.year:04d}-{_pad2(anchor.month)}",
            weeks=[_build_week_out(items, week_start)],
            day=None,
        )

    weeks = _build_month_weeks(items, anchor.year, anchor.month)
    return ScheduleCalendarViewOut(
        view="month",
        anchor=anchor_key,
        month=f"{anchor.year:04d}-{_pad2(anchor.month)}",
        weeks=weeks,
        day=None,
    )


def _is_priority_quadrant_status(status: str) -> bool:
    return status in ("todo", "doing")


def build_priority_view(items: list[ScheduleTaskItemOut]) -> SchedulePriorityViewOut:
    quadrants: dict[str, list[ScheduleTaskItemOut]] = {k: [] for k in PRIORITY_KEYS}
    for it in items:
        if not _is_priority_quadrant_status(it.status):
            continue
        quadrants[normalize_priority(it.priority)].append(it)

    for key in PRIORITY_KEYS:
        quadrants[key].sort(
            key=lambda x: (
                -(x.start_at.timestamp() if x.start_at else 0),
                x.title or "",
            )
        )

    return SchedulePriorityViewOut(quadrants=quadrants)


def build_swimlane_view(items: list[ScheduleTaskItemOut]) -> ScheduleSwimlaneViewOut:
    columns: dict[str, list[ScheduleTaskItemOut]] = {k: [] for k in STATUS_KEYS}
    for it in items:
        key = it.status if it.status in columns else "todo"
        columns[key].append(it)
    return ScheduleSwimlaneViewOut(columns=columns)
