from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models._mixins import utcnow
from app.models.file import File, FileBinding
from app.services.files import _delete_objects, log_file_activity


def rehome_binding(
    db: Session,
    *,
    binding_type: str,
    binding_id: uuid.UUID,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID | None,
) -> int:
    bindings = list(
        db.scalars(
            select(FileBinding).where(
                FileBinding.binding_type == binding_type,
                FileBinding.binding_id == binding_id,
            )
        ).all()
    )
    file_ids = [b.file_id for b in bindings]
    for binding in bindings:
        binding.workspace_id = workspace_id
        binding.project_id = project_id
    if file_ids:
        files = db.scalars(select(File).where(File.id.in_(file_ids))).all()
        for row in files:
            row.workspace_id = workspace_id
            row.project_id = project_id
    db.commit()
    return len(bindings)


def rehome_project(db: Session, *, project_id: uuid.UUID, workspace_id: uuid.UUID) -> int:
    files = list(db.scalars(select(File).where(File.project_id == project_id)).all())
    for row in files:
        row.workspace_id = workspace_id
    bindings = list(db.scalars(select(FileBinding).where(FileBinding.project_id == project_id)).all())
    for binding in bindings:
        binding.workspace_id = workspace_id
    db.commit()
    return len(files)


def unbind_target(db: Session, *, binding_type: str, binding_id: uuid.UUID) -> int:
    bindings = list(
        db.scalars(
            select(FileBinding)
            .options(selectinload(FileBinding.file).selectinload(File.variants))
            .where(
                FileBinding.binding_type == binding_type,
                FileBinding.binding_id == binding_id,
            )
        ).all()
    )
    count = 0
    for binding in bindings:
        file_row = binding.file
        workspace_id = binding.workspace_id
        file_id = binding.file_id
        db.delete(binding)
        db.flush()
        remaining = db.scalar(select(func.count(FileBinding.id)).where(FileBinding.file_id == file_id)) or 0
        if remaining == 0 and file_row is not None and file_row.deleted_at is None:
            _delete_objects(file_row)
            file_row.deleted_at = utcnow()
            file_row.status = "deleted"
            log_file_activity(
                db,
                workspace_id=workspace_id,
                actor_id=file_row.created_by_user_id,
                file_id=file_id,
                action="deleted",
                metadata={"kind": file_row.kind, "byte_size": file_row.byte_size},
            )
        count += 1
    db.commit()
    return count
