import uuid

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.item import Item
from app.models.project import Project
from app.models.user import User
from app.schemas.item import ItemOut, ItemUpdate, UserBrief
from app.services.permissions import require_project_content_access, user_can_access_project_content


def dedupe_uuid_preserve_order(ids: list[uuid.UUID]) -> list[uuid.UUID]:
    seen: set[uuid.UUID] = set()
    out: list[uuid.UUID] = []
    for x in ids:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def parse_assignee_id(raw: str | None) -> uuid.UUID:
    if not raw or not str(raw).strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_assignee_user_id")
    try:
        return uuid.UUID(str(raw).strip())
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_assignee_user_id")


def parse_participant_ids(raw: list[str]) -> list[uuid.UUID]:
    out: list[uuid.UUID] = []
    for s in raw:
        try:
            out.append(uuid.UUID(str(s).strip()))
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_participant_user_id")
    return dedupe_uuid_preserve_order(out)


def parse_transfer_target(fields_set: set[str], payload: ItemUpdate) -> tuple[uuid.UUID, uuid.UUID] | None:
    has_ws = "target_workspace_id" in fields_set and payload.target_workspace_id
    has_pj = "target_project_id" in fields_set and payload.target_project_id
    if not has_ws and not has_pj:
        return None
    if not has_ws or not has_pj:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_transfer_target")
    try:
        return uuid.UUID(str(payload.target_workspace_id).strip()), uuid.UUID(str(payload.target_project_id).strip())
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_transfer_target")


def apply_item_transfer(
    db: Session,
    item: Item,
    *,
    source_workspace_id: uuid.UUID,
    source_project_id: uuid.UUID,
    target_workspace_id: uuid.UUID,
    target_project_id: uuid.UUID,
    user: User,
) -> bool:
    if item.workspace_id == target_workspace_id and item.project_id == target_project_id:
        return False

    require_project_content_access(db, target_workspace_id, target_project_id, user)
    target_project = db.get(Project, target_project_id)
    if not target_project or target_project.workspace_id != target_workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project_not_found")

    from_ws = item.workspace_id
    item.workspace_id = target_workspace_id
    item.project_id = target_project_id

    if from_ws != target_workspace_id:
        db.execute(
            update(Comment)
            .where(Comment.item_id == item.id)
            .values(workspace_id=target_workspace_id)
        )

    return True


def validate_item_people(
    db: Session,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    assignee_id: uuid.UUID,
    participant_ids: list[uuid.UUID],
) -> None:
    if not user_can_access_project_content(db, workspace_id, project_id, assignee_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_assignee")
    for pid in participant_ids:
        if not user_can_access_project_content(db, workspace_id, project_id, pid):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_participant")


def _user_map(db: Session, ids: list[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not ids:
        return {}
    rows = db.scalars(select(User).where(User.id.in_(ids))).all()
    return {u.id: u for u in rows}


def _brief(u: User | None) -> UserBrief | None:
    if not u:
        return None
    return UserBrief(id=str(u.id), display_name=u.display_name)


def build_item_out(db: Session, i: Item) -> ItemOut:
    ordered: list[uuid.UUID] = []
    if i.created_by_user_id:
        ordered.append(i.created_by_user_id)
    if i.assignee_user_id:
        ordered.append(i.assignee_user_id)
    for p in i.participant_user_ids or []:
        ordered.append(p)
    uniq = dedupe_uuid_preserve_order(ordered)
    umap = _user_map(db, uniq)

    def b(uid: uuid.UUID | None) -> UserBrief | None:
        if not uid:
            return None
        return _brief(umap.get(uid))

    participants: list[UserBrief] = []
    for pid in i.participant_user_ids or []:
        br = b(pid)
        if br:
            participants.append(br)

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
        created_by=b(i.created_by_user_id),
        assignee=b(i.assignee_user_id),
        participants=participants,
        location=i.location,
    )
