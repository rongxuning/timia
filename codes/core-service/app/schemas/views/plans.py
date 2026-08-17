from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.plan import PlanSlotOut


class PlanCreatorOut(BaseModel):
    id: str
    display_name: str


class PlanCardOut(BaseModel):
    id: str
    title: str
    usage_kind: str
    period_kind: str
    visibility: str
    creator: PlanCreatorOut
    tags: list[str] = Field(default_factory=list)
    use_count: int


class PlanListOut(BaseModel):
    items: list[PlanCardOut]


class PlanMySubscriptionOut(BaseModel):
    id: str
    workspace_id: str
    workspace_name: str
    project_id: str
    project_name: str
    timezone: str


class PlanPendingRunOut(BaseModel):
    id: str
    period_start: date
    status: str
    template_version: int


class PlanDetailOut(PlanCardOut):
    description: str | None
    creator_intro: str | None
    slots: list[PlanSlotOut] = Field(default_factory=list)
    my_import_count: int
    my_subscription: PlanMySubscriptionOut | None = None
    pending_run: PlanPendingRunOut | None = None


class PlanRunItemOut(BaseModel):
    id: str
    title: str
    deleted: bool


class PlanImportedRunOut(BaseModel):
    period_start: date
    applied_at: datetime | None
    workspace_id: str
    project_id: str
    items: list[PlanRunItemOut] = Field(default_factory=list)


class PlanImportedRowOut(PlanCardOut):
    my_import_count: int
    runs: list[PlanImportedRunOut] = Field(default_factory=list)


class PlanImportedListOut(BaseModel):
    items: list[PlanImportedRowOut]


class PlanSubscribedSegmentOut(BaseModel):
    started_at: datetime
    ended_at: datetime | None
    runs: list[PlanImportedRunOut] = Field(default_factory=list)
    items: list[PlanRunItemOut] = Field(default_factory=list)


class PlanSubscribedRowOut(BaseModel):
    id: str
    template_id: str
    title: str
    usage_kind: str
    period_kind: str
    visibility: str
    creator: PlanCreatorOut
    tags: list[str] = Field(default_factory=list)
    use_count: int
    workspace_id: str
    workspace_name: str
    project_id: str
    project_name: str
    segments: list[PlanSubscribedSegmentOut] = Field(default_factory=list)
    pending_run: PlanPendingRunOut | None = None


class PlanSubscribedListOut(BaseModel):
    items: list[PlanSubscribedRowOut]


class PlanNotificationOut(BaseModel):
    id: str
    kind: str
    template_id: str | None = None
    subscription_id: str | None = None
    apply_run_id: str | None = None
    read_at: datetime | None = None
    created_at: datetime | None = None
    meta: dict[str, Any] = Field(default_factory=dict)
    pending_run: PlanPendingRunOut | None = None


class PlanNotificationListOut(BaseModel):
    items: list[PlanNotificationOut]
    unread_count: int
    pending_runs: list[PlanPendingRunOut] = Field(default_factory=list)
