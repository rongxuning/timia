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
from app.services.item_api import (
    build_item_out,
    parse_assignee_id,
    parse_participant_ids,
    validate_item_people,
)
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
    return [build_item_out(db, i) for i in rows]


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

    assignee_id = parse_assignee_id(payload.assignee_user_id) if payload.assignee_user_id else user.id
    participant_ids = parse_participant_ids(payload.participant_user_ids)
    validate_item_people(db, workspace_id, project_id, assignee_id, participant_ids)

    loc = (payload.location or "").strip() or None
    if loc and len(loc) > 500:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="location_too_long")

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
        created_by_user_id=user.id,
        assignee_user_id=assignee_id,
        participant_user_ids=participant_ids,
        location=loc,
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
    return build_item_out(db, i)


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
    return build_item_out(db, i)


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

    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))

    next_assignee = i.assignee_user_id
    if "assignee_user_id" in fields_set:
        if payload.assignee_user_id is None:
            next_assignee = i.created_by_user_id or user.id
        else:
            next_assignee = parse_assignee_id(payload.assignee_user_id)
    elif next_assignee is None:
        next_assignee = i.created_by_user_id or user.id

    next_participants = (
        parse_participant_ids(payload.participant_user_ids)
        if "participant_user_ids" in fields_set and payload.participant_user_ids is not None
        else list(i.participant_user_ids or [])
    )
    validate_item_people(db, workspace_id, project_id, next_assignee, next_participants)

    before = {
        "title": i.title,
        "body": i.body,
        "status": i.status,
        "priority": i.priority,
        "start_at": i.start_at.isoformat() if i.start_at else None,
        "end_at": i.end_at.isoformat() if i.end_at else None,
        "details": i.details,
        "version": i.version,
        "assignee_user_id": str(i.assignee_user_id) if i.assignee_user_id else None,
        "participant_user_ids": [str(x) for x in (i.participant_user_ids or [])],
        "location": i.location,
    }

    if payload.title is not None:
        i.title = payload.title
    if payload.body is not None:
        i.body = payload.body
    if payload.status is not None:
        i.status = payload.status
    if payload.priority is not None:
        i.priority = payload.priority
    if "start_at" in fields_set:
        i.start_at = payload.start_at
    if "end_at" in fields_set:
        i.end_at = payload.end_at
    if "details" in fields_set:
        i.details = payload.details

    if "assignee_user_id" in fields_set:
        i.assignee_user_id = next_assignee
    elif i.assignee_user_id is None:
        i.assignee_user_id = next_assignee

    if "participant_user_ids" in fields_set:
        if payload.participant_user_ids is None:
            i.participant_user_ids = []
        else:
            i.participant_user_ids = parse_participant_ids(payload.participant_user_ids)

    if "location" in fields_set:
        loc = (payload.location or "").strip() or None if payload.location is not None else None
        if loc and len(loc) > 500:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="location_too_long")
        i.location = loc

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
        "assignee_user_id": str(i.assignee_user_id) if i.assignee_user_id else None,
        "participant_user_ids": [str(x) for x in (i.participant_user_ids or [])],
        "location": i.location,
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
    return build_item_out(db, i)


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
