"""Project members management page view."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.schemas.views.members_page import AssignableUserOut, MembershipRowOut, ProjectMembersPageOut
from app.services.permissions import require_project_content_access, user_can_manage_project


def _ensure_project_creator_as_owner(db: Session, workspace_id: uuid.UUID, project: Project) -> None:
    """Mirror projects route: ensure creator is project owner."""
    if not project.created_by_user_id:
        return
    existing = db.scalar(
        select(ProjectMember).where(
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == project.created_by_user_id,
        )
    )
    if existing:
        if existing.status != "active" or existing.role != "owner":
            existing.status = "active"
            existing.role = "owner"
        return
    db.add(
        ProjectMember(
            workspace_id=workspace_id,
            project_id=project.id,
            user_id=project.created_by_user_id,
            role="owner",
            status="active",
        )
    )


def build_project_members_page(
    db: Session,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user: User,
) -> ProjectMembersPageOut:
    require_project_content_access(db, workspace_id, project_id, user)
    p = db.get(Project, project_id)
    if not p or p.workspace_id != workspace_id:
        raise ValueError("project_not_found")

    _ensure_project_creator_as_owner(db, workspace_id, p)
    db.commit()

    creator_id = p.created_by_user_id
    pm_rows = db.execute(
        select(ProjectMember, User)
        .join(User, User.id == ProjectMember.user_id)
        .where(
            ProjectMember.project_id == project_id,
            ProjectMember.workspace_id == workspace_id,
            ProjectMember.status == "active",
        )
        .order_by(ProjectMember.created_at.asc())
    ).all()

    project_members: list[MembershipRowOut] = []
    for m, u in pm_rows:
        project_members.append(
            MembershipRowOut(
                id=str(m.id),
                user_id=str(u.id),
                email=u.email,
                display_name=u.display_name,
                role=m.role,
                status=m.status,
                is_creator=bool(creator_id and u.id == creator_id),
            )
        )

    wm_rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == "active",
        )
        .order_by(User.display_name.asc(), User.email.asc())
    ).all()
    workspace_member_pool = [
        AssignableUserOut(user_id=str(u.id), email=u.email, display_name=u.display_name) for _m, u in wm_rows
    ]

    return ProjectMembersPageOut(
        workspace_id=str(workspace_id),
        project_id=str(project_id),
        project_name=p.name,
        created_by_user_id=str(creator_id) if creator_id else None,
        can_manage_project=user_can_manage_project(db, workspace_id, project_id, user),
        project_members=project_members,
        workspace_member_pool=workspace_member_pool,
    )
