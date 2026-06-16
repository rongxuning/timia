from pydantic import BaseModel
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    archived: bool | None = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: str | None
    archived: bool
    created_at: datetime
    created_by_user_id: str | None = None
    created_by_display_name: str | None = None
    """True when the current user may rename/archive/delete the project or manage its members."""
    can_manage: bool = False

