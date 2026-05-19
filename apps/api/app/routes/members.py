import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.workspace import MemberAdd, MemberOut, MemberRoleUpdate
from app.services.activity import log_activity
from app.services.permissions import require_workspace_member, require_workspace_owner

router = APIRouter(prefix="/workspaces/{workspace_id}/members", tags=["members"])


@router.get("", response_model=list[MemberOut])
def list_members(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # any member can list members (common in collaboration tools)
    require_workspace_member(db, workspace_id, user)

    ws = db.get(Workspace, workspace_id)
    creator_id = ws.created_by_user_id if ws else None

    rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.created_at.asc())
    ).all()
    out: list[MemberOut] = []
    for m, u in rows:
        out.append(
            MemberOut(
                id=str(m.id),
                user_id=str(u.id),
                email=u.email,
                display_name=u.display_name,
                role=m.role,
                status=m.status,
                is_creator=bool(creator_id and u.id == creator_id),
            )
        )
    return out


@router.post("", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def add_member(
    workspace_id: uuid.UUID,
    payload: MemberAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_workspace_owner(db, workspace_id, user)

    ws = db.get(Workspace, workspace_id)
    if not ws:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    if payload.user_id:
        try:
            target_user_id = uuid.UUID(str(payload.user_id).strip())
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_user_id")
        target_user = db.get(User, target_user_id)
    else:
        email = payload.email.strip().lower()  # type: ignore[union-attr]
        target_user = db.scalar(select(User).where(User.email == email))
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")

    effective_role = payload.role
    if target_user.id == ws.created_by_user_id:
        effective_role = "owner"

    existing = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == target_user.id,
        )
    )
    if existing and existing.status == "active":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already_member")

    if existing:
        existing.status = "active"
        existing.role = effective_role
        member_row = existing
    else:
        member_row = WorkspaceMember(
            workspace_id=workspace_id, user_id=target_user.id, role=effective_role, status="active"
        )
        db.add(member_row)
        db.flush()

    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="member",
        entity_id=member_row.id,
        action="add_member",
        metadata={"user_id": str(target_user.id), "role": effective_role},
    )
    db.commit()
    return MemberOut(
        id=str(member_row.id),
        user_id=str(target_user.id),
        email=target_user.email,
        display_name=target_user.display_name,
        role=member_row.role,
        status=member_row.status,
        is_creator=target_user.id == ws.created_by_user_id,
    )


@router.patch("/{user_id}", response_model=MemberOut)
def update_member_role(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: MemberRoleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_workspace_owner(db, workspace_id, user)
    m = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == "active",
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    ws = db.get(Workspace, workspace_id)
    if ws and m.user_id == ws.created_by_user_id:
        if payload.role != "owner":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="cannot_change_workspace_creator_role",
            )
        m.role = "owner"
    else:
        m.role = payload.role
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="member",
        entity_id=m.id,
        action="change_role",
        metadata={"role": m.role, "user_id": str(m.user_id)},
    )
    db.commit()

    u = db.get(User, m.user_id)
    return MemberOut(
        id=str(m.id),
        user_id=str(m.user_id),
        email=u.email if u else "unknown@example.com",
        display_name=u.display_name if u else "Unknown",
        role=m.role,
        status=m.status,
        is_creator=bool(ws and m.user_id == ws.created_by_user_id),
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_workspace_owner(db, workspace_id, user)
    m = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == "active",
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    ws = db.get(Workspace, workspace_id)
    if ws and m.user_id == ws.created_by_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cannot_remove_workspace_creator",
        )

    m.status = "removed"
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="member",
        entity_id=m.id,
        action="remove_member",
        metadata={"user_id": str(m.user_id)},
    )
    db.commit()
    return None
