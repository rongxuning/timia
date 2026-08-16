from pydantic import BaseModel, Field
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    archived: bool | None = None
    target_workspace_id: str | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class ProjectFavoriteUpdate(BaseModel):
    is_favorite: bool


class ProjectFavoriteOut(BaseModel):
    project_id: str
    is_favorite: bool


class ProjectOut(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str | None
    color: str = "#FFFFFF"
    archived: bool
    created_at: datetime
    is_favorite: bool = False
    created_by_user_id: str | None = None
    created_by_display_name: str | None = None
    """True when the current user may rename/archive/delete the project or manage its members."""
    can_manage: bool = False
