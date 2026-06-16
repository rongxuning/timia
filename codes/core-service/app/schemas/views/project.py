from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.views.schedule import ScheduleDashboardOut


class MemberAvatarPreviewOut(BaseModel):
    user_id: str
    display_name: str
    email: str
    initial: str


class ProjectMembersSummaryOut(BaseModel):
    total: int
    owner_count: int
    member_count: int
    owners_preview: list[MemberAvatarPreviewOut] = Field(default_factory=list)
    members_preview: list[MemberAvatarPreviewOut] = Field(default_factory=list)


class ProjectDashboardOut(BaseModel):
    workspace_id: str
    workspace_name: str
    project_id: str
    name: str
    description: str | None = None
    archived: bool
    can_manage: bool
    created_at: datetime | None = None
    created_at_label: str | None = None
    created_by_display_name: str | None = None
    members: ProjectMembersSummaryOut
    stats: ScheduleDashboardOut
