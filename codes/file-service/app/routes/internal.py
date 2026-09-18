from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_internal_token
from app.db.deps import get_db
from app.schemas.file import RehomeIn, RehomeProjectIn, UnbindIn
from app.services.internal import rehome_binding, rehome_project, unbind_target

router = APIRouter(
    prefix="/internal",
    tags=["internal"],
    dependencies=[Depends(require_internal_token)],
    include_in_schema=False,
)


@router.post("/bindings/rehome")
def rehome(payload: RehomeIn, db: Session = Depends(get_db)):
    count = rehome_binding(
        db,
        binding_type=payload.binding_type,
        binding_id=uuid.UUID(payload.binding_id),
        workspace_id=uuid.UUID(payload.workspace_id),
        project_id=uuid.UUID(payload.project_id) if payload.project_id else None,
    )
    return {"updated": count}


@router.post("/bindings/rehome-project")
def rehome_proj(payload: RehomeProjectIn, db: Session = Depends(get_db)):
    count = rehome_project(
        db,
        project_id=uuid.UUID(payload.project_id),
        workspace_id=uuid.UUID(payload.workspace_id),
    )
    return {"updated": count}


@router.post("/bindings/unbind")
def unbind(payload: UnbindIn, db: Session = Depends(get_db)):
    count = unbind_target(
        db,
        binding_type=payload.binding_type,
        binding_id=uuid.UUID(payload.binding_id),
    )
    return {"updated": count}
