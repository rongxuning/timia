import uuid
from datetime import datetime, timezone

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
    apply_item_transfer,
    build_item_out,
    materialize_repeat_occurrences,
    parse_assignee_id,
    parse_participant_ids,
    parse_transfer_target,
    resolve_item_completed_at,
    validate_item_people,
    validate_item_schedule_range,
    validate_undated_item_status,
)
from app.services.permissions import require_project_content_access

router = APIRouter(prefix="/workspaces/{workspace_id}/projects/{project_id}/items", tags=["items"])


def _get_project(db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID) -> Project:
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")
    return p


def _new_item_from_template(
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    creator_id: uuid.UUID,
    assignee_id: uuid.UUID | None,
    participant_ids: list[uuid.UUID],
    title: str,
    body: str | None,
    color: str,
    status: str,
    priority: str,
    start_at: datetime | None,
    end_at: datetime | None,
    details: str | None,
    location: str | None,
) -> Item:
    """Construct an Item from a snapshot of fields. Copies are independent rows."""
    return Item(
        workspace_id=workspace_id,
        project_id=project_id,
        title=title,
        body=body,
        color=color,
        status=status,
        priority=priority,
        start_at=start_at,
        end_at=end_at,
        completed_at=None,  # copies start fresh; never inherit completion time
        details=details,
        created_by_user_id=creator_id,
        assignee_user_id=assignee_id,
        participant_user_ids=list(participant_ids),
        location=location,
        version=1,
    )


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

    validate_item_schedule_range(payload.start_at, payload.end_at)
    validate_undated_item_status(payload.start_at, payload.end_at, payload.status)

    completed_at = resolve_item_completed_at(
        current_status=None,
        current_completed_at=None,
        next_status=payload.status,
        requested_completed_at=payload.completed_at,
        completed_at_was_set="completed_at" in payload.model_fields_set,
        now=datetime.now(timezone.utc),
    )

    repeat = payload.repeat or "none"
    if repeat not in ("none", "daily", "weekly", "monthly"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_repeat")

    i = _new_item_from_template(
        workspace_id=workspace_id,
        project_id=project_id,
        creator_id=user.id,
        assignee_id=assignee_id,
        participant_ids=participant_ids,
        title=payload.title,
        body=payload.body,
        color=payload.color.upper(),
        status=payload.status,
        priority=(payload.priority or "1"),
        start_at=payload.start_at,
        end_at=payload.end_at,
        details=payload.details,
        location=loc,
    )
    i.completed_at = completed_at
    db.add(i)
    db.flush()

    repeat_occurrences: list[Item] = []
    if repeat != "none" and payload.start_at is not None:
        for occ_start, occ_end in materialize_repeat_occurrences(
            start_at=payload.start_at,
            end_at=payload.end_at,
            repeat=repeat,
        ):
            occ = _new_item_from_template(
                workspace_id=workspace_id,
                project_id=project_id,
                creator_id=user.id,
                assignee_id=assignee_id,
                participant_ids=participant_ids,
                title=payload.title,
                body=payload.body,
                color=payload.color.upper(),
                status=payload.status,
                priority=(payload.priority or "1"),
                start_at=occ_start,
                end_at=occ_end,
                details=payload.details,
                location=loc,
            )
            db.add(occ)
            repeat_occurrences.append(occ)
        db.flush()

    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="item",
        entity_id=i.id,
        action="create",
        metadata={
            "title": i.title,
            "project_id": str(project_id),
            "repeat": repeat,
            "occurrence_count": len(repeat_occurrences),
        },
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
    transfer_target = parse_transfer_target(fields_set, payload)
    people_workspace_id = transfer_target[0] if transfer_target else workspace_id
    people_project_id = transfer_target[1] if transfer_target else project_id

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
    validate_item_people(db, people_workspace_id, people_project_id, next_assignee, next_participants)

    before = {
        "title": i.title,
        "body": i.body,
        "color": i.color,
        "status": i.status,
        "priority": i.priority,
        "start_at": i.start_at.isoformat() if i.start_at else None,
        "end_at": i.end_at.isoformat() if i.end_at else None,
        "completed_at": i.completed_at.isoformat() if i.completed_at else None,
        "details": i.details,
        "version": i.version,
        "assignee_user_id": str(i.assignee_user_id) if i.assignee_user_id else None,
        "participant_user_ids": [str(x) for x in (i.participant_user_ids or [])],
        "location": i.location,
        "workspace_id": str(i.workspace_id),
        "project_id": str(i.project_id),
    }

    if payload.title is not None:
        i.title = payload.title
    if payload.body is not None:
        i.body = payload.body
    if payload.color is not None:
        i.color = payload.color.upper()
    next_status = payload.status if payload.status is not None else i.status
    i.completed_at = resolve_item_completed_at(
        current_status=i.status,
        current_completed_at=i.completed_at,
        next_status=next_status,
        requested_completed_at=payload.completed_at,
        completed_at_was_set="completed_at" in fields_set,
    )
    i.status = next_status
    if payload.priority is not None:
        i.priority = payload.priority
    if "start_at" in fields_set:
        i.start_at = payload.start_at
    if "end_at" in fields_set:
        i.end_at = payload.end_at
    validate_item_schedule_range(i.start_at, i.end_at)
    validate_undated_item_status(i.start_at, i.end_at, i.status)
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

    transferred = False
    if transfer_target:
        transferred = apply_item_transfer(
            db,
            i,
            source_workspace_id=workspace_id,
            source_project_id=project_id,
            target_workspace_id=transfer_target[0],
            target_project_id=transfer_target[1],
            user=user,
        )

    i.version += 1

    after = {
        "title": i.title,
        "body": i.body,
        "color": i.color,
        "status": i.status,
        "priority": i.priority,
        "start_at": i.start_at.isoformat() if i.start_at else None,
        "end_at": i.end_at.isoformat() if i.end_at else None,
        "completed_at": i.completed_at.isoformat() if i.completed_at else None,
        "details": i.details,
        "version": i.version,
        "assignee_user_id": str(i.assignee_user_id) if i.assignee_user_id else None,
        "participant_user_ids": [str(x) for x in (i.participant_user_ids or [])],
        "location": i.location,
        "workspace_id": str(i.workspace_id),
        "project_id": str(i.project_id),
    }

    # Repeat: when payload.repeat is daily/weekly/monthly, materialize a fresh
    # batch of occurrences using the post-update fields as the template. The
    # current row is updated; copies are independent rows with no shared
    # linkage. Existing copies (if any) are untouched.
    if "repeat" in fields_set and payload.repeat not in (None, "none") and i.start_at is not None:
        if payload.repeat not in ("daily", "weekly", "monthly"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_repeat")
        occurrence_count = 0
        for occ_start, occ_end in materialize_repeat_occurrences(
            start_at=i.start_at,
            end_at=i.end_at,
            repeat=payload.repeat,
        ):
            occ = _new_item_from_template(
                workspace_id=i.workspace_id,
                project_id=i.project_id,
                creator_id=user.id,
                assignee_id=i.assignee_user_id,
                participant_ids=list(i.participant_user_ids or []),
                title=i.title,
                body=i.body,
                color=i.color,
                status=i.status,
                priority=i.priority,
                start_at=occ_start,
                end_at=occ_end,
                details=i.details,
                location=i.location,
            )
            db.add(occ)
            occurrence_count += 1
        db.flush()
        if occurrence_count:
            log_activity(
                db,
                workspace_id=i.workspace_id,
                actor_user_id=user.id,
                entity_type="item",
                entity_id=i.id,
                action="repeat_materialize",
                metadata={
                    "project_id": str(i.project_id),
                    "template_item_id": str(i.id),
                    "repeat": payload.repeat,
                    "occurrence_count": occurrence_count,
                },
            )

    if transferred:
        log_activity(
            db,
            workspace_id=workspace_id,
            actor_user_id=user.id,
            entity_type="item",
            entity_id=i.id,
            action="transfer",
            metadata={
                "before": before,
                "after": after,
                "from": {"workspace_id": str(workspace_id), "project_id": str(project_id)},
                "to": {
                    "workspace_id": str(transfer_target[0]),
                    "project_id": str(transfer_target[1]),
                },
            },
        )
    else:
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
