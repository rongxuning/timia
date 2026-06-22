from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.item import UserBrief


class TaskDrawerMemberOptionOut(BaseModel):
    user_id: str
    email: str
    display_name: str


class TaskDrawerContextOut(BaseModel):
    workspace_id: str
    workspace_name: str
    project_id: str
    project_name: str
    current_user_id: str
    current_user_display_name: str
    member_options: list[TaskDrawerMemberOptionOut] = Field(default_factory=list)


class ItemDetailCommentOut(BaseModel):
    id: str
    author_user_id: str
    author_display_name: str
    body: str
    created_at: datetime
    created_at_label: str
    deleted_at: datetime | None = None
    parent_comment_id: str | None = None
    completion_status: str
    is_author: bool


class ItemDetailViewOut(BaseModel):
    workspace_id: str
    project_id: str
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
    comments: list[ItemDetailCommentOut] = Field(default_factory=list)
