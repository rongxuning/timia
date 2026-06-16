"""Global user directory views (system admin)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.views.users import (
    UserDirectoryRowOut,
    UserDirectoryViewOut,
    UserMembershipDetailViewOut,
    UserMembershipProjectOut,
    UserMembershipWorkspaceOut,
)
from app.services.views.formatting import format_ymd_hm


def build_user_directory(db: Session) -> UserDirectoryViewOut:
    rows = db.execute(
        select(
            User,
            func.count(WorkspaceMember.id).filter(WorkspaceMember.status == "active").label("workspace_count"),
        )
        .outerjoin(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    ).all()

    users: list[UserDirectoryRowOut] = []
    users_with_workspace = 0
    workspace_assignments_total = 0
    for u, workspace_count in rows:
        wc = int(workspace_count or 0)
        if wc > 0:
            users_with_workspace += 1
        workspace_assignments_total += wc
        users.append(
            UserDirectoryRowOut(
                id=str(u.id),
                email=u.email,
                display_name=u.display_name,
                status=u.status,
                system_role=u.system_role,
                workspace_count=wc,
                created_at=u.created_at,
                created_at_label=format_ymd_hm(u.created_at) if u.created_at else None,
            )
        )

    total = len(users)
    return UserDirectoryViewOut(
        user_total=total,
        users_with_workspace=users_with_workspace,
        unassigned_user_count=total - users_with_workspace,
        workspace_assignments_total=workspace_assignments_total,
        users=users,
    )


def build_user_membership_detail(db: Session, user_id: uuid.UUID) -> UserMembershipDetailViewOut:
    member_rows = db.execute(
        select(WorkspaceMember, Workspace)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == user_id)
        .order_by(WorkspaceMember.created_at.desc())
    ).all()

    workspace_ids = [m.workspace_id for (m, _w) in member_rows]
    projects_by_workspace: dict[uuid.UUID, list[UserMembershipProjectOut]] = {}
    if workspace_ids:
        project_rows = db.scalars(
            select(Project).where(Project.workspace_id.in_(workspace_ids)).order_by(Project.created_at.desc())
        ).all()
        for p in project_rows:
            projects_by_workspace.setdefault(p.workspace_id, []).append(
                UserMembershipProjectOut(id=str(p.id), name=p.name, archived=p.archived)
            )

    workspaces: list[UserMembershipWorkspaceOut] = []
    for m, w in member_rows:
        projs = projects_by_workspace.get(w.id, [])
        workspaces.append(
            UserMembershipWorkspaceOut(
                workspace_id=str(w.id),
                workspace_name=w.name,
                membership_id=str(m.id),
                role=m.role,
                status=m.status,
                project_count=len(projs),
                projects=projs,
            )
        )

    return UserMembershipDetailViewOut(user_id=str(user_id), workspaces=workspaces)
