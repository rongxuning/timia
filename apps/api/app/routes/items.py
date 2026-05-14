import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.item import Item
from app.models.project import Project
from app.models.user import User
from app.schemas.item import ItemCreate, ItemOut, ItemUpdate
from app.services.activity import log_activity
from app.services.permissions import require_project_content_access

router = APIRouter(prefix="/workspaces/{workspace_id}/projects/{project_id}/items", tags=["items"])


def _get_project(db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")
    return p


@router.get("", response_model=list[ItemOut])
def list_items(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    _get_project(db, workspace_id, project_id)

    q = select(Item).where(Item.project_id == project_id, Item.workspace_id == workspace_id)
    if status_filter:
        q = q.where(Item.status == status_filter)
    q = q.order_by(Item.created_at.desc())
    rows = db.scalars(q).all()
    return [
        ItemOut(
            id=str(i.id),
            title=i.title,
            body=i.body,
            status=i.status,
            priority=i.priority,
            start_at=i.start_at,
            end_at=i.end_at,
            details=i.details,
            version=i.version,
        )
        for i in rows
    ]


@router.post("", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    payload: ItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    _get_project(db, workspace_id, project_id)
    i = Item(
        workspace_id=workspace_id,
        project_id=project_id,
        title=payload.title,
        body=payload.body,
        status=payload.status,
        priority=(payload.priority or "1"),
        start_at=payload.start_at,
        end_at=payload.end_at,
        details=payload.details,
        version=1,
    )
    db.add(i)
    db.flush()
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="item",
        entity_id=i.id,
        action="create",
        metadata={"title": i.title, "project_id": str(project_id)},
    )
    db.commit()
    return ItemOut(
        id=str(i.id),
        title=i.title,
        body=i.body,
        status=i.status,
        priority=i.priority,
        start_at=i.start_at,
        end_at=i.end_at,
        details=i.details,
        version=i.version,
    )


@router.get("/{item_id}", response_model=ItemOut)
def get_item(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    _get_project(db, workspace_id, project_id)
    i = db.get(Item, item_id)
    if not i or i.project_id != project_id or i.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return ItemOut(
        id=str(i.id),
        title=i.title,
        body=i.body,
        status=i.status,
        priority=i.priority,
        start_at=i.start_at,
        end_at=i.end_at,
        details=i.details,
        version=i.version,
    )


@router.patch("/{item_id}", response_model=ItemOut)
def update_item(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: ItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    _get_project(db, workspace_id, project_id)
    i = db.get(Item, item_id)
    if not i or i.project_id != project_id or i.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    if i.version != payload.version:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="version_conflict")

    before = {
        "title": i.title,
        "body": i.body,
        "status": i.status,
        "priority": i.priority,
        "start_at": i.start_at.isoformat() if i.start_at else None,
        "end_at": i.end_at.isoformat() if i.end_at else None,
        "details": i.details,
        "version": i.version,
    }

    if payload.title is not None:
        i.title = payload.title
    if payload.body is not None:
        i.body = payload.body
    if payload.status is not None:
        i.status = payload.status
    if payload.priority is not None:
        i.priority = payload.priority
    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))
    if "start_at" in fields_set:
        i.start_at = payload.start_at
    if "end_at" in fields_set:
        i.end_at = payload.end_at
    if "details" in fields_set:
        i.details = payload.details

    i.version += 1

    after = {
        "title": i.title,
        "body": i.body,
        "status": i.status,
        "priority": i.priority,
        "start_at": i.start_at.isoformat() if i.start_at else None,
        "end_at": i.end_at.isoformat() if i.end_at else None,
        "details": i.details,
        "version": i.version,
    }

    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="item",
        entity_id=i.id,
        action="update",
        metadata={"before": before, "after": after, "project_id": str(project_id)},
    )
    db.commit()
    return ItemOut(
        id=str(i.id),
        title=i.title,
        body=i.body,
        status=i.status,
        priority=i.priority,
        start_at=i.start_at,
        end_at=i.end_at,
        details=i.details,
        version=i.version,
    )


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    _get_project(db, workspace_id, project_id)
    i = db.get(Item, item_id)
    if not i or i.project_id != project_id or i.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    db.delete(i)
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="item",
        entity_id=i.id,
        action="delete",
        metadata={"project_id": str(project_id)},
    )
    db.commit()
    return None
