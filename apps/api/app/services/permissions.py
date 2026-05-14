"""Workspace / project scoped permissions: roles are only `owner` or `member` on memberships."""

from __future__ import annotations

import uuid
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import WorkspaceMember

WORKSPACE_OWNER = "owner"
WORKSPACE_MEMBER = "member"
PROJECT_OWNER = "owner"
PROJECT_MEMBER = "member"

WORKSPACE_ROLES = frozenset({WORKSPACE_OWNER, WORKSPACE_MEMBER})
PROJECT_ROLES = frozenset({PROJECT_OWNER, PROJECT_MEMBER})


def fetch_workspace_member(db: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceMember | None:
    return db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "active",
        )
    )


def require_workspace_member(db: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceMember:
    m = fetch_workspace_member(db, workspace_id, user)
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_a_member")
    return m


def require_workspace_owner(db: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceMember:
    m = require_workspace_member(db, workspace_id, user)
    if m.role != WORKSPACE_OWNER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")
    return m


def fetch_active_project_member(
    db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectMember | None:
    return db.scalar(
        select(ProjectMember).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.status == "active",
        )
    )


def workspace_owner_sees_all_projects(ws: WorkspaceMember) -> bool:
    return ws.role == WORKSPACE_OWNER


def accessible_project_ids(db: Session, workspace_id: uuid.UUID, user: User, ws: WorkspaceMember) -> list[uuid.UUID] | None:
    """
    None = all projects in workspace (workspace owner).
    Non-empty / empty list = explicit project ids for a workspace member.
    """
    if workspace_owner_sees_all_projects(ws):
        return None
    rows = db.scalars(
        select(ProjectMember.project_id).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.user_id == user.id,
            ProjectMember.status == "active",
        )
    ).all()
    return list(rows)


def require_project_content_access(
    db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID, user: User
) -> tuple[WorkspaceMember, ProjectMember | None]:
    """
    Read/write tasks and comments in a project.
    Workspace owner: implicit access (no project row required).
    Workspace member: must be an active project member (owner or member on project).
    """
    ws = require_workspace_member(db, workspace_id, user)
    if workspace_owner_sees_all_projects(ws):
        p = db.get(Project, project_id)
        if not p or p.workspace_id != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
        return ws, None
    pm = fetch_active_project_member(db, workspace_id, project_id, user.id)
    if not pm:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_project_member")
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return ws, pm


def can_moderate_comments(ws: WorkspaceMember, pm: ProjectMember | None) -> bool:
    """Edit/delete someone else's comment metadata or delete their comment."""
    if ws.role == WORKSPACE_OWNER:
        return True
    return pm is not None and pm.role == PROJECT_OWNER


def require_can_manage_project(
    db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID, user: User
) -> tuple[WorkspaceMember, ProjectMember | None]:
    """
    Rename/archive/delete project, manage project members.
    Workspace owner OR project owner (on that project).
    """
    ws = require_workspace_member(db, workspace_id, user)
    if workspace_owner_sees_all_projects(ws):
        p = db.get(Project, project_id)
        if not p or p.workspace_id != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
        return ws, None
    pm = fetch_active_project_member(db, workspace_id, project_id, user.id)
    if pm and pm.role == PROJECT_OWNER:
        p = db.get(Project, project_id)
        if not p or p.workspace_id != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
        return ws, pm
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")


def user_can_manage_project(db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID, user: User) -> bool:
    ws = fetch_workspace_member(db, workspace_id, user)
    if not ws:
        return False
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        return False
    if workspace_owner_sees_all_projects(ws):
        return True
    pm = fetch_active_project_member(db, workspace_id, project_id, user.id)
    return pm is not None and pm.role == PROJECT_OWNER
