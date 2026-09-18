from __future__ import annotations

import hashlib
import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models._mixins import utcnow
from app.models.file import File, FileActivity, FileBinding, FileVariant
from app.models.identity import User
from app.schemas.file import FileBindingOut, FileOut, UserBrief
from app.services.images import process_image
from app.services.media_kind import (
    KIND_IMAGE,
    UploadRejected,
    object_key_for,
    sanitize_filename,
    sniff_upload,
)
from app.services.permissions import require_file_scope
from app.storage import get_store
from app.storage.base import ObjectNotFound


def _content_path(file_id: uuid.UUID, variant: str = "original") -> str:
    if variant == "original":
        return f"/files/{file_id}/content"
    return f"/files/{file_id}/content?variant={variant}"


def build_file_out(db: Session, row: File) -> FileOut:
    creator = db.get(User, row.created_by_user_id)
    variant_names = {v.variant for v in row.variants}
    return FileOut(
        id=str(row.id),
        kind=row.kind,
        status=row.status,
        mime_type=row.mime_type,
        byte_size=row.byte_size,
        original_filename=row.original_filename,
        width_px=row.width_px,
        height_px=row.height_px,
        duration_ms=row.duration_ms,
        workspace_id=str(row.workspace_id),
        project_id=str(row.project_id) if row.project_id else None,
        folder_id=str(row.folder_id) if row.folder_id else None,
        created_by=UserBrief(id=str(creator.id), display_name=creator.display_name) if creator else None,
        created_at=row.created_at,
        bindings=[
            FileBindingOut(
                id=str(b.id),
                binding_type=b.binding_type,
                binding_id=str(b.binding_id),
            )
            for b in row.bindings
        ],
        content_path=_content_path(row.id),
        thumb_path=_content_path(row.id, "thumb") if "thumb" in variant_names else None,
        poster_path=_content_path(row.id, "poster") if "poster" in variant_names else None,
    )


def log_file_activity(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    actor_id: uuid.UUID,
    file_id: uuid.UUID | None,
    action: str,
    metadata: dict | None = None,
) -> None:
    db.add(
        FileActivity(
            workspace_id=workspace_id,
            actor_user_id=actor_id,
            file_id=file_id,
            action=action,
            extra=metadata or {},
        )
    )


def _item_binding_count(db: Session, item_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count(FileBinding.id)).where(
                FileBinding.binding_type == "item",
                FileBinding.binding_id == item_id,
            )
        )
        or 0
    )


def create_file(
    db: Session,
    *,
    user: User,
    kind: str,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID | None,
    binding_type: str | None,
    binding_id: uuid.UUID | None,
    filename: str,
    declared_mime: str | None,
    data: bytes,
    duration_ms: int | None = None,
) -> File:
    require_file_scope(db, workspace_id=workspace_id, project_id=project_id, user=user)
    try:
        mime = sniff_upload(kind=kind, data=data, declared_mime=declared_mime)
    except UploadRejected as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    if binding_type == "item":
        if binding_id is None or project_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_kind")
        if _item_binding_count(db, binding_id) >= settings.max_bindings_per_item:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="too_many_bindings")

    file_id = uuid.uuid4()
    store = get_store()
    backend = "memory" if settings.media_backend == "memory" else "s3"
    original = data
    width = height = None
    thumb_bytes = None
    tw = th = None

    if kind == KIND_IMAGE:
        original, width, height, thumb_bytes, tw, th = process_image(data)
        mime = "image/jpeg"

    key = object_key_for(file_id, "original")
    store.put(key, original, mime)

    row = File(
        id=file_id,
        workspace_id=workspace_id,
        project_id=project_id,
        created_by_user_id=user.id,
        kind=kind,
        status="ready",
        original_filename=sanitize_filename(filename),
        mime_type=mime,
        byte_size=len(original),
        width_px=width,
        height_px=height,
        duration_ms=duration_ms,
        object_key=key,
        storage_backend=backend,
        sha256=hashlib.sha256(original).hexdigest(),
    )
    db.add(row)
    db.flush()

    if thumb_bytes:
        thumb_key = object_key_for(file_id, "thumb")
        store.put(thumb_key, thumb_bytes, "image/jpeg")
        db.add(
            FileVariant(
                file_id=file_id,
                variant="thumb",
                object_key=thumb_key,
                mime_type="image/jpeg",
                byte_size=len(thumb_bytes),
                width_px=tw,
                height_px=th,
            )
        )

    if binding_type and binding_id:
        db.add(
            FileBinding(
                file_id=file_id,
                binding_type=binding_type,
                binding_id=binding_id,
                workspace_id=workspace_id,
                project_id=project_id,
            )
        )

    log_file_activity(
        db,
        workspace_id=workspace_id,
        actor_id=user.id,
        file_id=file_id,
        action="uploaded",
        metadata={"kind": kind, "byte_size": len(original), "original_filename": row.original_filename},
    )
    db.commit()
    db.refresh(row)
    row = db.scalar(
        select(File)
        .options(selectinload(File.variants), selectinload(File.bindings))
        .where(File.id == file_id)
    )
    assert row is not None
    return row


def get_visible_file(db: Session, file_id: uuid.UUID, user: User) -> File:
    row = db.scalar(
        select(File)
        .options(selectinload(File.variants), selectinload(File.bindings))
        .where(File.id == file_id)
    )
    if not row or row.deleted_at is not None or row.status != "ready":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    require_file_scope(db, workspace_id=row.workspace_id, project_id=row.project_id, user=user)
    return row


def list_files(
    db: Session,
    *,
    user: User,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID | None,
    kind: str | None,
    binding_type: str | None,
    binding_id: uuid.UUID | None,
    q: str | None,
    limit: int,
    cursor: str | None,
) -> tuple[list[File], str | None]:
    from app.services.permissions import accessible_project_ids

    allowed = accessible_project_ids(db, workspace_id, user)
    stmt = (
        select(File)
        .options(selectinload(File.variants), selectinload(File.bindings))
        .where(
            File.workspace_id == workspace_id,
            File.deleted_at.is_(None),
            File.status == "ready",
        )
    )
    if project_id is not None:
        require_file_scope(db, workspace_id=workspace_id, project_id=project_id, user=user)
        stmt = stmt.where(File.project_id == project_id)
    elif allowed is not None:
        stmt = stmt.where(or_(File.project_id.is_(None), File.project_id.in_(allowed)))
    if kind:
        stmt = stmt.where(File.kind == kind)
    if binding_type and binding_id:
        stmt = stmt.join(FileBinding).where(
            FileBinding.binding_type == binding_type,
            FileBinding.binding_id == binding_id,
        )
    if q:
        if len(q) > 100:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="query_too_long")
        term = q.replace("\\", "").replace("%", "").replace("_", "")
        stmt = stmt.where(File.original_filename.ilike(f"%{term}%"))
    if cursor:
        try:
            created, fid = cursor.split("|", 1)
            created_at = datetime.fromisoformat(created)
            file_uuid = uuid.UUID(fid)
        except (ValueError, TypeError) as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_kind") from e
        stmt = stmt.where(
            (File.created_at < created_at)
            | ((File.created_at == created_at) & (File.id < file_uuid))
        )
    stmt = stmt.order_by(File.created_at.desc(), File.id.desc()).limit(limit + 1)
    rows = list(db.scalars(stmt).unique().all())
    next_cursor = None
    if len(rows) > limit:
        last = rows[limit - 1]
        rows = rows[:limit]
        next_cursor = f"{last.created_at.isoformat()}|{last.id}"
    return rows, next_cursor


def rename_file(db: Session, row: File, user: User, filename: str) -> File:
    require_file_scope(db, workspace_id=row.workspace_id, project_id=row.project_id, user=user)
    row.original_filename = sanitize_filename(filename)
    log_file_activity(
        db,
        workspace_id=row.workspace_id,
        actor_id=user.id,
        file_id=row.id,
        action="renamed",
        metadata={"original_filename": row.original_filename},
    )
    db.commit()
    return get_visible_file(db, row.id, user)


def _delete_objects(row: File) -> None:
    store = get_store()
    store.delete(row.object_key)
    for variant in row.variants:
        store.delete(variant.object_key)


def soft_delete_file(db: Session, row: File, user: User) -> None:
    require_file_scope(db, workspace_id=row.workspace_id, project_id=row.project_id, user=user)
    _delete_objects(row)
    row.deleted_at = utcnow()
    row.status = "deleted"
    log_file_activity(
        db,
        workspace_id=row.workspace_id,
        actor_id=user.id,
        file_id=row.id,
        action="deleted",
        metadata={"kind": row.kind, "byte_size": row.byte_size},
    )
    db.commit()


def add_binding(
    db: Session,
    row: File,
    user: User,
    *,
    binding_type: str,
    binding_id: uuid.UUID,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID | None,
) -> File:
    require_file_scope(db, workspace_id=workspace_id, project_id=project_id, user=user)
    if binding_type == "item" and binding_id and _item_binding_count(db, binding_id) >= settings.max_bindings_per_item:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="too_many_bindings")
    existing = db.scalar(
        select(FileBinding).where(
            FileBinding.file_id == row.id,
            FileBinding.binding_type == binding_type,
            FileBinding.binding_id == binding_id,
        )
    )
    if existing is None:
        db.add(
            FileBinding(
                file_id=row.id,
                binding_type=binding_type,
                binding_id=binding_id,
                workspace_id=workspace_id,
                project_id=project_id,
            )
        )
        log_file_activity(
            db,
            workspace_id=workspace_id,
            actor_id=user.id,
            file_id=row.id,
            action="bound",
            metadata={"binding_type": binding_type, "binding_id": str(binding_id)},
        )
        db.commit()
    return get_visible_file(db, row.id, user)


def remove_binding(db: Session, row: File, user: User, binding_id: uuid.UUID) -> None:
    require_file_scope(db, workspace_id=row.workspace_id, project_id=row.project_id, user=user)
    binding = db.get(FileBinding, binding_id)
    if not binding or binding.file_id != row.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    db.delete(binding)
    log_file_activity(
        db,
        workspace_id=row.workspace_id,
        actor_id=user.id,
        file_id=row.id,
        action="unbound",
        metadata={"binding_type": binding.binding_type, "binding_id": str(binding.binding_id)},
    )
    db.flush()
    remaining = db.scalar(select(func.count(FileBinding.id)).where(FileBinding.file_id == row.id)) or 0
    if remaining == 0:
        _delete_objects(row)
        row.deleted_at = utcnow()
        row.status = "deleted"
        log_file_activity(
            db,
            workspace_id=row.workspace_id,
            actor_id=user.id,
            file_id=row.id,
            action="deleted",
            metadata={"kind": row.kind, "byte_size": row.byte_size},
        )
    db.commit()


def read_content(row: File, variant: str) -> tuple[bytes, str, str]:
    store = get_store()
    if variant == "original":
        key = row.object_key
        mime = row.mime_type
    else:
        match = next((v for v in row.variants if v.variant == variant), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
        key = match.object_key
        mime = match.mime_type
    try:
        data = store.get(key)
    except ObjectNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
    return data, mime, row.original_filename


def read_range(row: File, variant: str, start: int, end: int | None) -> tuple[bytes, str, str, int]:
    store = get_store()
    if variant == "original":
        key = row.object_key
        mime = row.mime_type
    else:
        match = next((v for v in row.variants if v.variant == variant), None)
        if match is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
        key = match.object_key
        mime = match.mime_type
    try:
        chunk, total = store.get_range(key, start, end)
    except ObjectNotFound as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
    return chunk, mime, row.original_filename, total
