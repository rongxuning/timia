"""Calendar / swimlane / priority layout for schedule view APIs."""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone as datetime_timezone
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.schemas.views.schedule import (
    CalendarDayDetailOut,
    CalendarHeatDayOut,
    CalendarMonthSummaryOut,
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
CalendarViewKind = Literal["year", "month", "week", "day"]
DEFAULT_CALENDAR_TIMEZONE = "Asia/Shanghai"
UTC_CALENDAR_TIMEZONE = ZoneInfo("UTC")


def _pad2(n: int) -> str:
    return f"{n:02d}"


def _day_key(d: date) -> str:
    return f"{d.year}-{_pad2(d.month)}-{_pad2(d.day)}"


def resolve_calendar_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError("invalid timezone") from error


def _in_calendar_timezone(value: datetime, calendar_timezone: ZoneInfo) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime_timezone.utc)
    return value.astimezone(calendar_timezone)


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


def _local_day_range_from_item(
    it: ScheduleTaskItemOut,
    calendar_timezone: ZoneInfo,
) -> tuple[str, str] | None:
    if not it.start_at:
        return None
    local_start = _in_calendar_timezone(it.start_at, calendar_timezone)
    s_date = local_start.date()
    if not it.end_at:
        k = _day_key(s_date)
        return k, k

    local_end_exclusive = _in_calendar_timezone(it.end_at, calendar_timezone)
    if local_end_exclusive <= local_start:
        k = _day_key(s_date)
        return k, k

    # End time is exclusive. A task ending exactly at local midnight belongs
    # to the preceding day, matching the Web timeline clipping behavior.
    e_date = (local_end_exclusive - timedelta(microseconds=1)).date()
    if e_date < s_date:
        e_date = s_date
    return _day_key(s_date), _day_key(e_date)


def _item_covers_day(
    it: ScheduleTaskItemOut,
    day: date,
    calendar_timezone: ZoneInfo = UTC_CALENDAR_TIMEZONE,
) -> bool:
    range_keys = _local_day_range_from_item(it, calendar_timezone)
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
    calendar_timezone: ZoneInfo,
) -> list[CalendarSegmentOut]:
    raw_segments: list[dict] = []

    for it in items:
        range_keys = _local_day_range_from_item(it, calendar_timezone)
        if not range_keys or not it.start_at:
            continue
        task_start = date.fromisoformat(range_keys[0])
        task_end = date.fromisoformat(range_keys[1])
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
    calendar_timezone: ZoneInfo,
    *,
    in_month: int | None = None,
) -> CalendarWeekOut:
    week_days = _build_week_days(week_start, in_month=in_month)
    week_first_date = date.fromisoformat(week_days[0].key)
    week_last_date = date.fromisoformat(week_days[6].key)
    segments = _build_week_segments(items, week_first_date, week_last_date, calendar_timezone)
    return CalendarWeekOut(days=week_days, segments=segments)


def _build_month_weeks(
    items: list[ScheduleTaskItemOut],
    year: int,
    month: int,
    calendar_timezone: ZoneInfo,
) -> list[CalendarWeekOut]:
    first = date(year, month, 1)
    grid_start = _sunday_week_start(first)
    last = date(year, month, calendar.monthrange(year, month)[1])
    grid_end = _sunday_week_start(last) + timedelta(days=6)
    week_count = ((grid_end - grid_start).days // 7) + 1
    weeks: list[CalendarWeekOut] = []
    for w in range(week_count):
        week_start = grid_start + timedelta(days=w * 7)
        week_out = _build_week_out(items, week_start, calendar_timezone, in_month=month)
        # 月视图视觉顺序：先按本地时区起始时间升序，再按优先级降序。
        # 关键：前端月视图用 `gridRow: seg.lane + 1` 定位视觉行，
        #       所以必须**重分配 lane**才能改变视觉顺序（单纯重排 list 无效）。
        # 同时遵守 col range 不冲突的约束，避免视觉重叠。
        # 不影响周视图——周视图直接走 _build_week_out。
        week_out.segments = _reorder_segments_for_display(week_out.segments, calendar_timezone)
        weeks.append(week_out)
    return weeks


def _reorder_segments_for_display(
    segments: list[CalendarSegmentOut],
    calendar_timezone: ZoneInfo,
) -> list[CalendarSegmentOut]:
    """
    月视图展示用排序 + 重分配 lane：
    - 主：本地时区起始时间升序（无 start_at 的排最后）
    - 次：priority 降序（4 > 3 > 2 > 1，None/未知排最后）
    - 同 start_at + 同 priority：保持原顺序（stable sort）
    - 重新分配 lane：第一遍按 (col_start, -col_span) 排列时分配原始 lane；
      第二遍按 sort key 排列后，**first-fit** 重新分配 lane（仍遵守 col range 不冲突），
      保证跨列任务不与同列其他任务占同一 row。
    """
    def sort_key(seg: CalendarSegmentOut):
        item = seg.item
        if item.start_at:
            start = _in_calendar_timezone(item.start_at, calendar_timezone)
        else:
            # 没有起始时间的放到最后
            start = datetime.max.replace(tzinfo=calendar_timezone)
        pri_raw = item.priority
        if pri_raw in ("1", "2", "3", "4"):
            pri_num = int(pri_raw)
        else:
            pri_num = 0
        return (start, -pri_num)

    # 保留每个 seg 在原始 segments 里的下标，作为 stable sort tiebreaker
    indexed = list(enumerate(segments))

    def key_with_index(idx_seg: tuple[int, CalendarSegmentOut]):
        idx, seg = idx_seg
        return (*sort_key(seg), idx)

    sorted_pairs = sorted(indexed, key=key_with_index)

    # First-fit 重分配 lane：遍历排序后的 seg，找一个 lane，
    # 让该 lane 上已有的所有 seg 的 col range 都不与当前 seg 的 col range 重叠
    lane_occupancy: list[list[tuple[int, int]]] = []  # lane_occupancy[lane] = [(col_start, col_end), ...]
    reordered: list[CalendarSegmentOut] = []
    for _idx, seg in sorted_pairs:
        cs = seg.col_start
        ce = seg.col_start + seg.col_span - 1
        placed = False
        for lane_idx in range(len(lane_occupancy) + 1):
            if lane_idx >= len(lane_occupancy):
                lane_occupancy.append([])
                placed = True
                lane_occupancy[lane_idx].append((cs, ce))
                reordered.append(
                    CalendarSegmentOut(
                        item=seg.item,
                        col_start=seg.col_start,
                        col_span=seg.col_span,
                        lane=lane_idx,
                        round_left=seg.round_left,
                        round_right=seg.round_right,
                    )
                )
                break
            occupied = lane_occupancy[lane_idx]
            conflict = any(not (r_e < cs or r_s > ce) for r_s, r_e in occupied)
            if not conflict:
                lane_occupancy[lane_idx].append((cs, ce))
                reordered.append(
                    CalendarSegmentOut(
                        item=seg.item,
                        col_start=seg.col_start,
                        col_span=seg.col_span,
                        lane=lane_idx,
                        round_left=seg.round_left,
                        round_right=seg.round_right,
                    )
                )
                placed = True
                break
        if not placed:
            # 理论上不会到这里（上面的循环多开了一格新 lane），
            # 但保险起见再 append 一个
            lane_occupancy.append([(cs, ce)])
            reordered.append(
                CalendarSegmentOut(
                    item=seg.item,
                    col_start=seg.col_start,
                    col_span=seg.col_span,
                    lane=len(lane_occupancy) - 1,
                    round_left=seg.round_left,
                    round_right=seg.round_right,
                )
            )

    return reordered


def _build_day_detail(
    items: list[ScheduleTaskItemOut],
    day: date,
    calendar_timezone: ZoneInfo,
) -> CalendarDayDetailOut:
    day_items = [it for it in items if _item_covers_day(it, day, calendar_timezone)]
    day_items.sort(
        key=lambda x: (
            x.start_at.timestamp() if x.start_at else 0,
            x.title or "",
        )
    )
    weekday = (day.weekday() + 1) % 7
    return CalendarDayDetailOut(key=_day_key(day), weekday=weekday, items=day_items)


def _build_year_months(
    items: list[ScheduleTaskItemOut],
    year: int,
    calendar_timezone: ZoneInfo,
) -> list[CalendarMonthSummaryOut]:
    months: list[CalendarMonthSummaryOut] = []
    for month in range(1, 13):
        day_count = calendar.monthrange(year, month)[1]
        days: list[CalendarHeatDayOut] = []
        month_item_ids: set[str] = set()
        todo_item_ids: set[str] = set()
        done_item_ids: set[str] = set()

        for day_number in range(1, day_count + 1):
            current = date(year, month, day_number)
            covered = [
                item
                for item in items
                if _item_covers_day(item, current, calendar_timezone)
            ]
            days.append(CalendarHeatDayOut(key=_day_key(current), task_count=len(covered)))
            for item in covered:
                month_item_ids.add(item.id)
                if item.status in ("todo", "doing"):
                    todo_item_ids.add(item.id)
                elif item.status in ("done", "archived"):
                    done_item_ids.add(item.id)

        months.append(
            CalendarMonthSummaryOut(
                month=month,
                task_count=len(month_item_ids),
                todo_count=len(todo_item_ids),
                done_count=len(done_item_ids),
                days=days,
            )
        )
    return months


def build_calendar_view(
    items: list[ScheduleTaskItemOut],
    *,
    view: CalendarViewKind = "month",
    anchor: date,
    timezone_name: str = DEFAULT_CALENDAR_TIMEZONE,
) -> ScheduleCalendarViewOut:
    calendar_timezone = resolve_calendar_timezone(timezone_name)
    anchor_key = _day_key(anchor)

    if view == "year":
        return ScheduleCalendarViewOut(
            view="year",
            anchor=anchor_key,
            month=None,
            year=anchor.year,
            weeks=[],
            months=_build_year_months(items, anchor.year, calendar_timezone),
            day=None,
        )

    if view == "day":
        return ScheduleCalendarViewOut(
            view="day",
            anchor=anchor_key,
            month=None,
            year=None,
            weeks=[],
            months=[],
            day=_build_day_detail(items, anchor, calendar_timezone),
        )

    if view == "week":
        week_start = _sunday_week_start(anchor)
        return ScheduleCalendarViewOut(
            view="week",
            anchor=anchor_key,
            month=f"{anchor.year:04d}-{_pad2(anchor.month)}",
            year=None,
            weeks=[_build_week_out(items, week_start, calendar_timezone)],
            months=[],
            day=None,
        )

    weeks = _build_month_weeks(items, anchor.year, anchor.month, calendar_timezone)
    return ScheduleCalendarViewOut(
        view="month",
        anchor=anchor_key,
        month=f"{anchor.year:04d}-{_pad2(anchor.month)}",
        year=None,
        weeks=weeks,
        months=[],
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


def build_swimlane_view(
    items: list[ScheduleTaskItemOut],
    *,
    task_status: str | None = None,
    limit: int = 10,
    offset: int = 0,
    completed_limit: int = 5,
) -> ScheduleSwimlaneViewOut:
    grouped: dict[str, list[ScheduleTaskItemOut]] = {k: [] for k in STATUS_KEYS}
    for it in items:
        key = it.status if it.status in grouped else "todo"
        grouped[key].append(it)

    def recent_key(item: ScheduleTaskItemOut) -> float:
        timestamp = item.completed_at or item.end_at or item.start_at
        return timestamp.timestamp() if timestamp else 0

    grouped["done"].sort(key=recent_key, reverse=True)
    grouped["archived"].sort(key=recent_key, reverse=True)
    totals = {key: len(grouped[key]) for key in STATUS_KEYS}
    columns: dict[str, list[ScheduleTaskItemOut]] = {key: [] for key in STATUS_KEYS}
    has_more = {key: False for key in STATUS_KEYS}

    if task_status is not None:
        start = max(offset, 0)
        size = max(limit, 1)
        columns[task_status] = grouped[task_status][start : start + size]
        has_more[task_status] = start + len(columns[task_status]) < totals[task_status]
    else:
        columns["todo"] = grouped["todo"]
        columns["doing"] = grouped["doing"]
        for key in ("done", "archived"):
            columns[key] = grouped[key][: max(completed_limit, 1)]
            has_more[key] = len(columns[key]) < totals[key]

    return ScheduleSwimlaneViewOut(columns=columns, totals=totals, has_more=has_more)
