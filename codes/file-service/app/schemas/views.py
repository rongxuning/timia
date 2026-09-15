from pydantic import BaseModel, Field

from app.schemas.file import FileOut


class FileBrowserCrumbOut(BaseModel):
    id: str
    name: str


class FileBrowserItemOut(FileOut):
    size_label: str


class FileBrowserTotalsOut(BaseModel):
    file_count: int
    byte_size: int


class FileBrowserViewOut(BaseModel):
    workspace_id: str
    workspace_name: str
    project_id: str | None = None
    project_name: str | None = None
    folder_id: str | None = None
    folder_name: str | None = None
    crumbs: list[FileBrowserCrumbOut] = Field(default_factory=list)
    folders: list[dict] = Field(default_factory=list)
    files: list[FileBrowserItemOut] = Field(default_factory=list)
    next_cursor: str | None = None
    totals: FileBrowserTotalsOut
