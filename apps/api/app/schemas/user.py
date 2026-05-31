from datetime import datetime

from pydantic import BaseModel


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    status: str
    system_role: str
    workspace_count: int
    created_at: datetime


class WorkspaceBrief(BaseModel):
    id: str
    name: str
    description: str | None = None


class MembershipBrief(BaseModel):
    id: str
    role: str
    status: str


class ProjectBrief(BaseModel):
    id: str
    name: str
    description: str | None
    archived: bool


class UserWorkspaceOut(BaseModel):
    workspace: WorkspaceBrief
    membership: MembershipBrief
    projects: list[ProjectBrief]

