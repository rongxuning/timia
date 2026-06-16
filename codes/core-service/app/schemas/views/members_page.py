from pydantic import BaseModel, EmailStr


class AssignableUserOut(BaseModel):
    user_id: str
    email: EmailStr
    display_name: str


class MembershipRowOut(BaseModel):
    id: str
    user_id: str
    email: EmailStr
    display_name: str
    role: str
    status: str
    is_creator: bool = False


class WorkspaceMembersPageOut(BaseModel):
    workspace_id: str
    name: str
    description: str | None = None
    created_by_user_id: str | None = None
    current_user_id: str
    can_manage_workspace: bool
    members: list[MembershipRowOut]
    assignable_users: list[AssignableUserOut]


class ProjectMembersPageOut(BaseModel):
    workspace_id: str
    project_id: str
    project_name: str
    created_by_user_id: str | None = None
    can_manage_project: bool
    project_members: list[MembershipRowOut]
    workspace_member_pool: list[AssignableUserOut]
