from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.file import File
from app.models.identity import Project, User, Workspace
from app.schemas.views import FileBrowserItemOut, FileBrowserTotalsOut, FileBrowserViewOut
from app.services.files import build_file_out, list_files
from app.services.permissions import require_file_scope

router = APIRouter(prefix="/views", tags=["views-files"])


def _size_label(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / (1024 * 1024):.1f} MB"


@router.get("/file-browser", response_model=FileBrowserViewOut)
def file_browser(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    folder_id: uuid.UUID | None = None,
    kind: str | None = None,
    q: str | None = None,
    sort: str = "created_at",
    order: str = "desc",
    limit: int = Query(default=40, ge=1, le=100),
    cursor: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ = (folder_id, sort, order)
    require_file_scope(db, workspace_id=workspace_id, project_id=project_id, user=user)
    workspace = db.get(Workspace, workspace_id)
    project = db.get(Project, project_id) if project_id else None
    rows, next_cursor = list_files(
        db,
        user=user,
        workspace_id=workspace_id,
        project_id=project_id,
        kind=kind,
        binding_type=None,
        binding_id=None,
        q=q,
        limit=limit,
        cursor=cursor,
    )
    count_stmt = select(func.count(File.id), func.coalesce(func.sum(File.byte_size), 0)).where(
        File.workspace_id == workspace_id,
        File.deleted_at.is_(None),
        File.status == "ready",
    )
    if project_id is not None:
        count_stmt = count_stmt.where(File.project_id == project_id)
    if kind:
        count_stmt = count_stmt.where(File.kind == kind)
    file_count, byte_size = db.execute(count_stmt).one()
    files = []
    for row in rows:
        base = build_file_out(db, row)
        files.append(FileBrowserItemOut(**base.model_dump(), size_label=_size_label(row.byte_size)))
    return FileBrowserViewOut(
        workspace_id=str(workspace_id),
        workspace_name=workspace.name if workspace else "",
        project_id=str(project_id) if project_id else None,
        project_name=project.name if project else None,
        folders=[],
        files=files,
        next_cursor=next_cursor,
        totals=FileBrowserTotalsOut(file_count=int(file_count or 0), byte_size=int(byte_size or 0)),
    )
