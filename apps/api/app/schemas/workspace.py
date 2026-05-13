from datetime import datetime

from pydantic import BaseModel, EmailStr


class WorkspaceCreate(BaseModel):
    name: str
    description: str | None = None


class WorkspaceOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    created_at: datetime | None = None
    created_by_user_id: str | None = None
    created_by_display_name: str | None = None


class MemberOut(BaseModel):
    id: str
    user_id: str
    email: EmailStr
    display_name: str
    role: str
    status: str


class MemberAdd(BaseModel):
    email: EmailStr
    role: str = "member"


class MemberRoleUpdate(BaseModel):
    role: str


class RecentDiscussionOut(BaseModel):
    """Single comment or reply in workspace-wide recent feed."""

    id: str
    body: str
    created_at: datetime
    author_display_name: str
    is_reply: bool
    completion_status: str
    project_id: str
    project_name: str
    item_id: str
    item_title: str

