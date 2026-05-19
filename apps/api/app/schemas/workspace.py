from datetime import datetime

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator


class WorkspaceCreate(BaseModel):
    name: str
    description: str | None = None


class WorkspaceUpdate(BaseModel):
    name: str | None = None
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
    is_creator: bool = False


class MemberAdd(BaseModel):
    """Add by email (legacy) or by user_id (preferred for UI). Exactly one must be set."""

    email: EmailStr | None = None
    user_id: str | None = Field(default=None, description="Target user UUID as string")
    role: Literal["owner", "member"] = "member"

    @model_validator(mode="after")
    def exactly_one_identifier(self) -> "MemberAdd":
        has_email = self.email is not None
        has_uid = bool(self.user_id and str(self.user_id).strip())
        if has_email == has_uid:
            raise ValueError("Provide exactly one of email or user_id")
        return self


class MemberRoleUpdate(BaseModel):
    role: Literal["owner", "member"]


class RecentDiscussionOut(BaseModel):
    """Single comment or reply in workspace-wide recent feed."""

    id: str
    body: str
    created_at: datetime
    author_user_id: str
    author_display_name: str
    is_reply: bool
    completion_status: str
    project_id: str
    project_name: str
    item_id: str
    item_title: str

