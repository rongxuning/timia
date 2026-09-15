from datetime import datetime

from pydantic import BaseModel, Field


class UserBrief(BaseModel):
    id: str
    display_name: str


class FileBindingOut(BaseModel):
    id: str
    binding_type: str
    binding_id: str


class FileOut(BaseModel):
    id: str
    kind: str
    status: str
    mime_type: str
    byte_size: int
    original_filename: str
    width_px: int | None = None
    height_px: int | None = None
    duration_ms: int | None = None
    workspace_id: str
    project_id: str | None = None
    folder_id: str | None = None
    created_by: UserBrief | None = None
    created_at: datetime
    bindings: list[FileBindingOut] = Field(default_factory=list)
    content_path: str
    thumb_path: str | None = None
    poster_path: str | None = None


class FileListOut(BaseModel):
    items: list[FileOut] = Field(default_factory=list)
    next_cursor: str | None = None


class FileBindingCreate(BaseModel):
    binding_type: str
    binding_id: str
    workspace_id: str
    project_id: str | None = None


class FileUpdate(BaseModel):
    original_filename: str | None = None


class RehomeIn(BaseModel):
    binding_type: str
    binding_id: str
    workspace_id: str
    project_id: str | None = None


class UnbindIn(BaseModel):
    binding_type: str
    binding_id: str


class RehomeProjectIn(BaseModel):
    project_id: str
    workspace_id: str
