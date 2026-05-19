from pydantic import BaseModel


class WorkspaceCardUser(BaseModel):
    id: str
    email: str
    display_name: str
    role: str
    status: str


class WorkspaceCardOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    project_count: int
    # Tasks (items) across all projects in the workspace, by status.
    todo_count: int = 0
    doing_count: int = 0
    done_count: int = 0
    archived_count: int = 0
    owners: list[WorkspaceCardUser]
    members: list[WorkspaceCardUser]
    my_workspace_role: str = "member"

