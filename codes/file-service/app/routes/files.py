from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.identity import User
from app.schemas.file import FileBindingCreate, FileListOut, FileOut, FileUpdate
from app.services.files import (
    add_binding,
    build_file_out,
    create_file,
    get_visible_file,
    list_files,
    read_content,
    read_range,
    remove_binding,
    rename_file,
    soft_delete_file,
)
from app.services.media_kind import VARIANTS

router = APIRouter(prefix="/files", tags=["files"])

_RANGE = re.compile(r"bytes=(\d+)-(\d*)")


@router.post("", response_model=FileOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    kind: str = Form(...),
    workspace_id: str = Form(...),
    project_id: str | None = Form(default=None),
    binding_type: str | None = Form(default=None),
    binding_id: str | None = Form(default=None),
    duration_ms: int | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = await file.read()
    row = create_file(
        db,
        user=user,
        kind=kind,
        workspace_id=uuid.UUID(workspace_id),
        project_id=uuid.UUID(project_id) if project_id else None,
        binding_type=binding_type,
        binding_id=uuid.UUID(binding_id) if binding_id else None,
        filename=file.filename or "file",
        declared_mime=file.content_type,
        data=data,
        duration_ms=duration_ms,
    )
    return build_file_out(db, row)


@router.get("", response_model=FileListOut)
def list_file_rows(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID | None = None,
    kind: str | None = None,
    binding_type: str | None = None,
    binding_id: uuid.UUID | None = None,
    q: str | None = None,
    limit: int = Query(default=40, ge=1, le=100),
    cursor: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows, next_cursor = list_files(
        db,
        user=user,
        workspace_id=workspace_id,
        project_id=project_id,
        kind=kind,
        binding_type=binding_type,
        binding_id=binding_id,
        q=q,
        limit=limit,
        cursor=cursor,
    )
    return FileListOut(items=[build_file_out(db, r) for r in rows], next_cursor=next_cursor)


@router.get("/{file_id}", response_model=FileOut)
def get_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = get_visible_file(db, file_id, user)
    return build_file_out(db, row)


@router.get("/{file_id}/content")
def get_file_content(
    file_id: uuid.UUID,
    variant: str = "original",
    range: str | None = Header(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if variant not in VARIANTS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_kind")
    row = get_visible_file(db, file_id, user)
    headers = {"Cache-Control": "private, no-store"}
    if range:
        match = _RANGE.fullmatch(range.strip())
        if not match:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_kind")
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else None
        chunk, mime, filename, total = read_range(row, variant, start, end)
        stop = start + len(chunk) - 1 if chunk else start
        headers["Content-Range"] = f"bytes {start}-{stop}/{total}"
        headers["Content-Disposition"] = f'inline; filename="{filename}"'
        headers["Accept-Ranges"] = "bytes"
        return Response(content=chunk, status_code=206, media_type=mime, headers=headers)
    data, mime, filename = read_content(row, variant)
    headers["Content-Disposition"] = f'inline; filename="{filename}"'
    headers["Accept-Ranges"] = "bytes"
    return Response(content=data, media_type=mime, headers=headers)


@router.patch("/{file_id}", response_model=FileOut)
def patch_file(
    file_id: uuid.UUID,
    payload: FileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = get_visible_file(db, file_id, user)
    if payload.original_filename:
        row = rename_file(db, row, user, payload.original_filename)
    return build_file_out(db, row)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = get_visible_file(db, file_id, user)
    soft_delete_file(db, row, user)


@router.post("/{file_id}/bindings", response_model=FileOut, status_code=status.HTTP_201_CREATED)
def create_binding(
    file_id: uuid.UUID,
    payload: FileBindingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = get_visible_file(db, file_id, user)
    row = add_binding(
        db,
        row,
        user,
        binding_type=payload.binding_type,
        binding_id=uuid.UUID(payload.binding_id),
        workspace_id=uuid.UUID(payload.workspace_id),
        project_id=uuid.UUID(payload.project_id) if payload.project_id else None,
    )
    return build_file_out(db, row)


@router.delete("/{file_id}/bindings/{binding_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_binding(
    file_id: uuid.UUID,
    binding_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = get_visible_file(db, file_id, user)
    remove_binding(db, row, user, binding_id)
