from datetime import datetime

from pydantic import BaseModel, Field


class UserBrief(BaseModel):
    id: str
    display_name: str


class ItemCreate(BaseModel):
    title: str
    body: str | None = None
    status: str = "todo"
    priority: str = "1"
    start_at: datetime | None = None
    end_at: datetime | None = None
    details: str | None = None
    assignee_user_id: str | None = None
    participant_user_ids: list[str] = Field(default_factory=list)
    location: str | None = None


class ItemUpdate(BaseModel):
    version: int
    title: str | None = None
    body: str | None = None
    status: str | None = None
    priority: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    details: str | None = None
    assignee_user_id: str | None = None
    participant_user_ids: list[str] | None = None
    location: str | None = None
    target_workspace_id: str | None = None
    target_project_id: str | None = None


class ItemOut(BaseModel):
    id: str
    title: str
    body: str | None
    status: str
    priority: str | None
    start_at: datetime | None
    end_at: datetime | None
    details: str | None
    version: int
    created_by: UserBrief | None = None
    assignee: UserBrief | None = None
    participants: list[UserBrief] = Field(default_factory=list)
    location: str | None = None
