from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AudienceIn(BaseModel):
    type: Literal["broadcast", "user_ids", "project_id", "workspace_id"]
    user_ids: list[str] = Field(default_factory=list)
    project_id: str | None = None
    workspace_id: str | None = None
    exclude_user_ids: list[str] = Field(default_factory=list)


class NotificationCreate(BaseModel):
    title: str | None = None
    body: str | None = None
    sender_user_id: str | None = None
    link: str | None = None
    audience: AudienceIn
    timing: Literal["immediate", "delay", "scheduled"] = "immediate"
    scheduled_at: datetime | None = None
    scenario_key: str | None = None
    variables: dict[str, str] = Field(default_factory=dict)


class NotificationCreatedOut(BaseModel):
    id: str
    status: str
    delivery_count: int
    scenario_key: str | None = None


class InboxItemOut(BaseModel):
    id: str
    notification_id: str
    title: str
    body: str
    sender_user_id: str | None
    sender_display_name: str | None
    link: str | None
    scenario_key: str | None
    read_at: datetime | None
    created_at: datetime
    push_status: str


class InboxOut(BaseModel):
    items: list[InboxItemOut]
    unread_count: int


class ReadAllOut(BaseModel):
    updated: int


class ScenarioOut(BaseModel):
    key: str
    enabled: bool
    title_template: str
    body_template: str
    push_enabled: bool


class ScenarioPatch(BaseModel):
    enabled: bool | None = None
    title_template: str | None = None
    body_template: str | None = None
    push_enabled: bool | None = None


class AdminNotificationCreate(BaseModel):
    title: str
    body: str = ""
    link: str | None = None
    audience: AudienceIn
    timing: Literal["immediate", "delay", "scheduled"] = "immediate"
    scheduled_at: datetime | None = None


class DeviceTokenIn(BaseModel):
    token: str = Field(min_length=1, max_length=400)
    environment: Literal["sandbox", "production"] | None = None


class DeviceTokenOut(BaseModel):
    id: str
    environment: str
    platform: str
