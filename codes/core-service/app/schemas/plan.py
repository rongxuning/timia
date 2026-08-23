from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PlanTemplateCreate(BaseModel):
    title: str
    description: str | None = None
    creator_intro: str | None = None
    usage_kind: str
    period_kind: str
    visibility: str
    tags: list[str] = Field(default_factory=list)


class PlanTemplateUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    creator_intro: str | None = None
    visibility: str | None = None
    tags: list[str] | None = None


class PlanSlotPut(BaseModel):
    rel_month: int | None = None
    rel_day: int
    start_minute: int
    end_minute: int
    all_day: bool = False
    title: str
    body: str | None = None
    details: str | None = None
    color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    priority: str = "1"
    location: str | None = None
    sort_index: int = 0


class PlanSlotOut(BaseModel):
    id: str
    rel_month: int | None
    rel_day: int
    start_minute: int
    end_minute: int
    all_day: bool
    title: str
    body: str | None
    details: str | None
    color: str
    priority: str
    location: str | None
    sort_index: int


class PlanTemplateOut(BaseModel):
    id: str
    title: str
    description: str | None
    creator_intro: str | None
    usage_kind: str
    period_kind: str
    visibility: str
    tags: list[str]
    use_count: int
    version: int
    created_by_user_id: str


class PlanApplyRequest(BaseModel):
    workspace_id: UUID
    project_id: UUID
    period_start: date


class PlanApplyRunOut(BaseModel):
    id: str
    template_id: str
    template_version: int
    workspace_id: str
    project_id: str
    source: str
    period_start: date
    period_kind: str
    status: str
    skipped_slots: list[dict[str, Any]] = Field(default_factory=list)
    item_count: int
    applied_at: datetime | None


class PlanSubscribeRequest(BaseModel):
    workspace_id: UUID
    project_id: UUID
    timezone: str


class PlanSubscribeOut(BaseModel):
    id: str
    imported_current_period: bool
    apply_run: PlanApplyRunOut | None = None


class PlanConfirmRunOut(PlanApplyRunOut):
    template_updated: bool = False


class PlanCommentCreate(BaseModel):
    body: str
    parent_comment_id: UUID | None = None


class PlanCommentUpdate(BaseModel):
    body: str


class PlanFavoriteUpdate(BaseModel):
    is_favorite: bool


class PlanFavoriteOut(BaseModel):
    template_id: str
    is_favorite: bool


class PlanCommentOut(BaseModel):
    id: str
    author_user_id: str
    author_display_name: str
    body: str
    created_at: datetime
    parent_comment_id: str | None
