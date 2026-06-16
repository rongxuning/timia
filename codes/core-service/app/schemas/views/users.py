from datetime import datetime

from pydantic import BaseModel


class UserDirectoryRowOut(BaseModel):
    id: str
    email: str
    display_name: str
    status: str
    system_role: str
    workspace_count: int
    created_at: datetime | None = None
    created_at_label: str | None = None


class UserDirectoryViewOut(BaseModel):
    user_total: int
    users_with_workspace: int
    unassigned_user_count: int
    workspace_assignments_total: int
    users: list[UserDirectoryRowOut]


class UserMembershipProjectOut(BaseModel):
    id: str
    name: str
    archived: bool


class UserMembershipWorkspaceOut(BaseModel):
    workspace_id: str
    workspace_name: str
    membership_id: str
    role: str
    status: str
    project_count: int
    projects: list[UserMembershipProjectOut]


class UserMembershipDetailViewOut(BaseModel):
    user_id: str
    workspaces: list[UserMembershipWorkspaceOut]
