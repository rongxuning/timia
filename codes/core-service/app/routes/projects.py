import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.item import Item
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate
from app.schemas.project_member import ProjectMemberAdd, ProjectMemberOut, ProjectMemberRoleUpdate
from app.services.activity import log_activity
from app.services.project_api import apply_project_transfer, parse_project_transfer_target
from app.services.permissions import (
    PROJECT_OWNER,
    accessible_project_ids,
    require_can_manage_project,
    require_project_content_access,
    require_workspace_member,
    require_workspace_owner,
    user_can_manage_project,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/projects", tags=["projects"])


def _ensure_project_creator_as_owner(db: Session, workspace_id: uuid.UUID, p: Project) -> None:
    """Creator must have an active project membership with role owner (legacy DBs may lack the row)."""
    if not p.created_by_user_id:
        return
    uid = p.created_by_user_id
    m = db.scalar(
        select(ProjectMember).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.project_id == p.id,
            ProjectMember.user_id == uid,
        )
    )
    if not m:
        db.add(
            ProjectMember(
                workspace_id=workspace_id,
                project_id=p.id,
                user_id=uid,
                role=PROJECT_OWNER,
                status="active",
            )
        )
    else:
        if m.status != "active":
            m.status = "active"
        m.role = PROJECT_OWNER


def _project_out(
    p: Project,
    *,
    creators: dict[uuid.UUID, User],
    can_manage: bool,
) -> ProjectOut:
    creator = creators.get(p.created_by_user_id) if p.created_by_user_id else None
    return ProjectOut(
        id=str(p.id),
        workspace_id=str(p.workspace_id),
        name=p.name,
        description=p.description,
        archived=p.archived,
        created_at=p.created_at,
        created_by_user_id=str(p.created_by_user_id) if p.created_by_user_id else None,
        created_by_display_name=creator.display_name if creator else None,
        can_manage=can_manage,
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws = require_workspace_member(db, workspace_id, user)
    allowed = accessible_project_ids(db, workspace_id, user, ws)
    q = select(Project).where(Project.workspace_id == workspace_id).order_by(Project.created_at.desc())
    if allowed is not None:
        if not allowed:
            return []
        q = q.where(Project.id.in_(allowed))
    rows = db.scalars(q).all()
    creator_ids = {p.created_by_user_id for p in rows if p.created_by_user_id}
    creators: dict[uuid.UUID, User] = {}
    if creator_ids:
        creators = {u.id: u for u in db.scalars(select(User).where(User.id.in_(creator_ids))).all()}

    return [
        _project_out(
            p,
            creators=creators,
            can_manage=user_can_manage_project(db, workspace_id, p.id, user),
        )
        for p in rows
    ]


@router.get("/progress")
def list_project_progress(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Return per-project task counts needed for progress UI.
    A = todo + doing
    B = done + archived
    """
    ws = require_workspace_member(db, workspace_id, user)
    allowed = accessible_project_ids(db, workspace_id, user, ws)

    q = select(Item.project_id, Item.status, func.count(Item.id)).where(Item.workspace_id == workspace_id)
    if allowed is not None:
        if not allowed:
            return {}
        q = q.where(Item.project_id.in_(allowed))
    rows = db.execute(q.group_by(Item.project_id, Item.status)).all()

    out: dict[str, dict[str, int]] = {}
    for project_id, status_value, cnt in rows:
        pid = str(project_id)
        status_str = str(status_value)
        d = out.setdefault(pid, {"todo_doing": 0, "done_archived": 0})
        if status_str in ("todo", "doing"):
            d["todo_doing"] += int(cnt)
        elif status_str in ("done", "archived"):
            d["done_archived"] += int(cnt)
    return out


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    workspace_id: uuid.UUID,
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_workspace_owner(db, workspace_id, user)
    p = Project(
        workspace_id=workspace_id,
        created_by_user_id=user.id,
        name=payload.name,
        description=payload.description,
        archived=False,
    )
    db.add(p)
    db.flush()
    db.add(
        ProjectMember(
            workspace_id=workspace_id,
            project_id=p.id,
            user_id=user.id,
            role=PROJECT_OWNER,
            status="active",
        )
    )
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="project",
        entity_id=p.id,
        action="create",
        metadata={"name": p.name},
    )
    db.commit()
    return _project_out(p, creators={user.id: user}, can_manage=True)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    creator_ids = {p.created_by_user_id} if p.created_by_user_id else set()
    creators = {}
    if creator_ids:
        creators = {u.id: u for u in db.scalars(select(User).where(User.id.in_(creator_ids))).all()}
    return _project_out(
        p,
        creators=creators,
        can_manage=user_can_manage_project(db, workspace_id, project_id, user),
    )


@router.get("/{project_id}/members", response_model=list[ProjectMemberOut])
def list_project_members(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    _ensure_project_creator_as_owner(db, workspace_id, p)
    db.commit()

    rows = db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.status == "active",
        )
        .order_by(ProjectMember.created_at.asc())
    ).all()
    out: list[ProjectMemberOut] = []
    for m, u in rows:
        is_creator = bool(p.created_by_user_id and u.id == p.created_by_user_id)
        out.append(
            ProjectMemberOut(
                id=str(m.id),
                user_id=str(u.id),
                email=u.email,
                display_name=u.display_name,
                role=m.role,
                status=m.status,
                is_creator=is_creator,
            )
        )
    return out


@router.post("/{project_id}/members", response_model=ProjectMemberOut, status_code=status.HTTP_201_CREATED)
def add_project_member(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    payload: ProjectMemberAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_can_manage_project(db, workspace_id, project_id, user)
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    try:
        target_user_id = uuid.UUID(payload.user_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_user_id")

    ws_member = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == target_user_id,
            WorkspaceMember.status == "active",
        )
    )
    if not ws_member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_in_workspace")

    existing = db.scalar(
        select(ProjectMember).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == target_user_id,
        )
    )
    if existing and existing.status == "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already_member")

    effective_role = PROJECT_OWNER if (p.created_by_user_id and target_user_id == p.created_by_user_id) else payload.role

    if existing:
        existing.status = "active"
        existing.role = effective_role
        member_row = existing
    else:
        member_row = ProjectMember(
            workspace_id=workspace_id,
            project_id=project_id,
            user_id=target_user_id,
            role=effective_role,
            status="active",
        )
        db.add(member_row)
        db.flush()

    u = db.get(User, target_user_id)
    db.commit()
    is_creator = bool(p.created_by_user_id and target_user_id == p.created_by_user_id)
    return ProjectMemberOut(
        id=str(member_row.id),
        user_id=str(target_user_id),
        email=u.email if u else "unknown@example.com",
        display_name=u.display_name if u else "Unknown",
        role=member_row.role,
        status=member_row.status,
        is_creator=is_creator,
    )


@router.patch("/{project_id}/members/{user_id}", response_model=ProjectMemberOut)
def update_project_member_role(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ProjectMemberRoleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_can_manage_project(db, workspace_id, project_id, user)
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    m = db.scalar(
        select(ProjectMember).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.status == "active",
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    if p.created_by_user_id and user_id == p.created_by_user_id:
        if payload.role != PROJECT_OWNER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="cannot_change_project_creator_role",
            )
        m.role = PROJECT_OWNER
    else:
        m.role = payload.role

    db.commit()
    u = db.get(User, user_id)
    is_creator = bool(p.created_by_user_id and user_id == p.created_by_user_id)
    return ProjectMemberOut(
        id=str(m.id),
        user_id=str(user_id),
        email=u.email if u else "unknown@example.com",
        display_name=u.display_name if u else "Unknown",
        role=m.role,
        status=m.status,
        is_creator=is_creator,
    )


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_project_member(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_can_manage_project(db, workspace_id, project_id, user)
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    m = db.scalar(
        select(ProjectMember).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.status == "active",
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if p.created_by_user_id and user_id == p.created_by_user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_remove_project_creator")
    m.status = "removed"
    db.commit()
    return None


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_can_manage_project(db, workspace_id, project_id, user)
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    fields_set = getattr(payload, "model_fields_set", getattr(payload, "__fields_set__", set()))
    transfer_target = parse_project_transfer_target(fields_set, payload)

    before = {"name": p.name, "description": p.description, "archived": p.archived}
    if payload.name is not None:
        p.name = payload.name
    if payload.description is not None:
        p.description = payload.description
    if payload.archived is not None:
        p.archived = payload.archived
    after = {"name": p.name, "description": p.description, "archived": p.archived}

    transfer_result: dict[str, int | bool] = {"transferred": False}
    if transfer_target:
        transfer_result = apply_project_transfer(
            db,
            p,
            source_workspace_id=workspace_id,
            target_workspace_id=transfer_target,
            user=user,
        )

    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="project",
        entity_id=p.id,
        action="update",
        metadata={"before": before, "after": after},
    )
    if transfer_result.get("transferred"):
        transfer_meta = {
            "from": {"workspace_id": str(workspace_id), "project_id": str(project_id)},
            "to": {"workspace_id": str(transfer_target), "project_id": str(project_id)},
            "member_count": transfer_result.get("member_count", 0),
            "item_count": transfer_result.get("item_count", 0),
        }
        log_activity(
            db,
            workspace_id=workspace_id,
            actor_user_id=user.id,
            entity_type="project",
            entity_id=p.id,
            action="transfer",
            metadata=transfer_meta,
        )
        log_activity(
            db,
            workspace_id=transfer_target,
            actor_user_id=user.id,
            entity_type="project",
            entity_id=p.id,
            action="transfer",
            metadata=transfer_meta,
        )

    db.commit()
    creator_ids = {p.created_by_user_id} if p.created_by_user_id else set()
    creators = {}
    if creator_ids:
        creators = {u.id: u for u in db.scalars(select(User).where(User.id.in_(creator_ids))).all()}
    return _project_out(
        p,
        creators=creators,
        can_manage=user_can_manage_project(db, p.workspace_id, project_id, user),
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_can_manage_project(db, workspace_id, project_id, user)
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    db.delete(p)
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="project",
        entity_id=p.id,
        action="delete",
        metadata={},
    )
    db.commit()
    return None
