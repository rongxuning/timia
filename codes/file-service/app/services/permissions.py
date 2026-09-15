from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import Project, ProjectMember, User, WorkspaceMember

WORKSPACE_OWNER = "owner"


def fetch_workspace_member(db: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceMember | None:
    return db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "active",
        )
    )


def require_workspace_member(db: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceMember:
    member = fetch_workspace_member(db, workspace_id, user)
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_a_member")
    return member


def require_project_content_access(
    db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID, user: User
) -> WorkspaceMember:
    ws = require_workspace_member(db, workspace_id, user)
    if ws.role == WORKSPACE_OWNER:
        project = db.get(Project, project_id)
        if not project or project.workspace_id != workspace_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
        return ws
    pm = db.scalar(
        select(ProjectMember).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
            ProjectMember.status == "active",
        )
    )
    if not pm:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_project_member")
    project = db.get(Project, project_id)
    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return ws


def accessible_project_ids(db: Session, workspace_id: uuid.UUID, user: User) -> list[uuid.UUID] | None:
    """None means all projects (workspace owner)."""
    ws = require_workspace_member(db, workspace_id, user)
    if ws.role == WORKSPACE_OWNER:
        return None
    rows = db.scalars(
        select(ProjectMember.project_id).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.user_id == user.id,
            ProjectMember.status == "active",
        )
    ).all()
    return list(rows)


def require_file_scope(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID | None,
    user: User,
) -> WorkspaceMember:
    if project_id is None:
        return require_workspace_member(db, workspace_id, user)
    return require_project_content_access(db, workspace_id, project_id, user)


def session_is_expired(expires_at: datetime) -> bool:
    now = datetime.now(UTC)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    return expires_at <= now
