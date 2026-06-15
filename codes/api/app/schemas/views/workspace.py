from datetime import datetime

from pydantic import BaseModel, Field


class MemberPreviewOut(BaseModel):
    id: str
    display_name: str
    email: str


class WorkspaceMembersSummaryOut(BaseModel):
    total: int
    owner_count: int
    member_count: int
    owners_preview: list[MemberPreviewOut] = Field(default_factory=list)
    members_preview: list[MemberPreviewOut] = Field(default_factory=list)


class WorkspaceStatsViewOut(BaseModel):
    project_count: int
    total_task_count: int
    todo_count: int
    doing_count: int
    done_count: int
    archived_count: int
    high_priority_count: int
    health_percent: int | None


class WorkspaceProjectCardOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    can_manage: bool
    todo_doing: int
    done_archived: int
    progress_percent: int


class WorkspaceDashboardOut(BaseModel):
    workspace_id: str
    name: str
    description: str | None = None
    created_at: datetime | None = None
    created_by_display_name: str | None = None
    can_edit_workspace: bool
    current_user_id: str
    members: WorkspaceMembersSummaryOut
    stats: WorkspaceStatsViewOut
    active_projects: list[WorkspaceProjectCardOut]
    total_active_projects: int


class DiscussionViewItemOut(BaseModel):
    id: str
    body: str
    created_at: datetime
    created_at_exact_label: str
    created_ago_label: str
    author_user_id: str
    author_display_name: str
    is_reply: bool
    completion_status: str
    is_author: bool
    project_id: str
    project_name: str
    item_id: str
    item_title: str


class WorkspaceDiscussionsViewOut(BaseModel):
    items: list[DiscussionViewItemOut]
    has_more: bool
