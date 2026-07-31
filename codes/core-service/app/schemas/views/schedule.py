from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.item import UserBrief


class ScheduleTaskItemOut(BaseModel):
    id: str
    title: str
    body: str | None = None
    color: str = "#FFFFFF"
    status: str
    priority: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    completed_at: datetime | None = None
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


class CalendarHeatDayOut(BaseModel):
    key: str
    task_count: int


class CalendarMonthSummaryOut(BaseModel):
    month: int
    task_count: int
    todo_count: int
    done_count: int
    days: list[CalendarHeatDayOut] = Field(default_factory=list)


class ScheduleCalendarViewOut(BaseModel):
    view: Literal["year", "month", "week", "day"]
    anchor: str
    month: str | None = None
    year: int | None = None
    weeks: list[CalendarWeekOut] = Field(default_factory=list)
    months: list[CalendarMonthSummaryOut] = Field(default_factory=list)
    day: CalendarDayDetailOut | None = None


class ScheduleSwimlaneViewOut(BaseModel):
    columns: dict[str, list[ScheduleTaskItemOut]]
    totals: dict[str, int]
    has_more: dict[str, bool]


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


class NaturalLanguageParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=100)
    reference_time: datetime
    selected_date: date


class NaturalLanguageTaskDraft(BaseModel):
    title: str
    body: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool = False
    status: Literal["todo", "doing", "done", "archived"] = "todo"
    priority: Literal["1", "2", "3", "4"] = "1"
    location: str | None = None
    workspace_name: str | None = None
    project_name: str | None = None
    assignee_name: str | None = None
    participant_names: list[str] = Field(default_factory=list)
    recurrence_text: str | None = None


class NaturalLanguageParseOut(BaseModel):
    draft: NaturalLanguageTaskDraft
    confidence: float = Field(ge=0, le=1)
    assumptions: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
