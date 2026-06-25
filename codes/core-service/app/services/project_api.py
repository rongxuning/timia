import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.item import Item
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.project import ProjectUpdate
from app.services.permissions import WORKSPACE_MEMBER, require_workspace_owner


def parse_project_transfer_target(fields_set: set[str], payload: ProjectUpdate) -> uuid.UUID | None:
    if "target_workspace_id" not in fields_set or not payload.target_workspace_id:
        return None
    try:
        return uuid.UUID(str(payload.target_workspace_id).strip())
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_transfer_target")


def ensure_project_members_in_workspace(
    db: Session,
    target_workspace_id: uuid.UUID,
    project_members: list[ProjectMember],
) -> None:
    """Ensure active project members can access the target workspace (as workspace member)."""
    for pm in project_members:
        if pm.status != "active":
            continue
        existing = db.scalar(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == target_workspace_id,
                WorkspaceMember.user_id == pm.user_id,
            )
        )
        if existing and existing.status == "active":
            continue
        if existing:
            existing.status = "active"
            existing.role = WORKSPACE_MEMBER
        else:
            db.add(
                WorkspaceMember(
                    workspace_id=target_workspace_id,
                    user_id=pm.user_id,
                    role=WORKSPACE_MEMBER,
                    status="active",
                )
            )


def apply_project_transfer(
    db: Session,
    project: Project,
    *,
    source_workspace_id: uuid.UUID,
    target_workspace_id: uuid.UUID,
    user: User,
) -> dict[str, int | bool]:
    if project.workspace_id == target_workspace_id:
        return {"transferred": False, "member_count": 0, "item_count": 0}

    require_workspace_owner(db, target_workspace_id, user)

    target_ws = db.get(Workspace, target_workspace_id)
    if not target_ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    project_members = list(
        db.scalars(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.workspace_id == source_workspace_id,
            )
        ).all()
    )
    active_member_count = sum(1 for m in project_members if m.status == "active")
    ensure_project_members_in_workspace(db, target_workspace_id, project_members)

    item_count = (
        db.scalar(
            select(func.count(Item.id)).where(
                Item.project_id == project.id,
                Item.workspace_id == source_workspace_id,
            )
        )
        or 0
    )

    project.workspace_id = target_workspace_id
    db.execute(
        update(ProjectMember)
        .where(ProjectMember.project_id == project.id)
        .values(workspace_id=target_workspace_id)
    )
    db.execute(
        update(Item).where(Item.project_id == project.id).values(workspace_id=target_workspace_id)
    )
    item_ids_subq = select(Item.id).where(Item.project_id == project.id)
    db.execute(
        update(Comment)
        .where(Comment.item_id.in_(item_ids_subq))
        .values(workspace_id=target_workspace_id)
    )

    return {
        "transferred": True,
        "member_count": active_member_count,
        "item_count": int(item_count),
    }
