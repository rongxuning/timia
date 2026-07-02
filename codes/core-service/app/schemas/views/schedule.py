from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.item import UserBrief


class ScheduleTaskItemOut(BaseModel):
    id: str
    title: str
    body: str | None = None
    status: str
    priority: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    details: str | None = None
    version: int
    created_by: UserBrief | None = None
    assignee: UserBrief | None = None
    participants: list[UserBrief] = Field(default_factory=list)
    location: str | None = None
    workspace_id: str
    workspace_name: str
    project_id: str
    project_name: str


class CalendarDayOut(BaseModel):
    key: str
    day: int
    in_month: bool


class CalendarSegmentOut(BaseModel):
    item: ScheduleTaskItemOut
    col_start: int
    col_span: int
    lane: int
    round_left: bool
    round_right: bool


class CalendarWeekOut(BaseModel):
    days: list[CalendarDayOut]
    segments: list[CalendarSegmentOut]


class CalendarDayDetailOut(BaseModel):
    key: str
    weekday: int
    items: list[ScheduleTaskItemOut]


class ScheduleCalendarViewOut(BaseModel):
    view: Literal["month", "week", "day"]
    anchor: str
    month: str | None = None
    weeks: list[CalendarWeekOut] = Field(default_factory=list)
    day: CalendarDayDetailOut | None = None


class ScheduleSwimlaneViewOut(BaseModel):
    columns: dict[str, list[ScheduleTaskItemOut]]


class SchedulePriorityViewOut(BaseModel):
    quadrants: dict[str, list[ScheduleTaskItemOut]]


class ScheduleDashboardOut(BaseModel):
    task_total: int
    todo_count: int
    doing_count: int
    done_count: int
    archived_count: int
    health_percent: int | None


class MyScheduleDashboardOut(ScheduleDashboardOut):
    display_name: str
    email: str
    workspace_count: int
    project_count: int
    today_todo_count: int
    overdue_count: int
    due_this_week_count: int
