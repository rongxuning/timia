"""Project home dashboard view."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.views.project import MemberAvatarPreviewOut, ProjectDashboardOut, ProjectMembersSummaryOut
from app.schemas.views.schedule import ScheduleDashboardOut
from app.services.permissions import require_project_content_access, user_can_manage_project
from app.services.views.formatting import format_ymd_hm
from app.services.views.project_members_page import _ensure_project_creator_as_owner
from app.services.views.schedule_items import ScheduleScope, _count_dashboard, list_schedule_items


def _member_initial(display_name: str, email: str) -> str:
    source = display_name.strip() or email.strip()
    return source[:1].upper() if source else "?"


def _avatar_preview(u: User, role: str) -> MemberAvatarPreviewOut:
    return MemberAvatarPreviewOut(
        user_id=str(u.id),
        display_name=u.display_name,
        email=u.email,
        initial=_member_initial(u.display_name, u.email),
    )


def build_project_dashboard(db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID, user: User) -> ProjectDashboardOut:
    require_project_content_access(db, workspace_id, project_id, user)
    w = db.get(Workspace, workspace_id)
    p = db.get(Project, project_id)
    if not w or not p or p.workspace_id != workspace_id:
        raise ValueError("project_not_found")

    _ensure_project_creator_as_owner(db, workspace_id, p)
    db.commit()

    creator_name: str | None = None
    if p.created_by_user_id:
        creator = db.get(User, p.created_by_user_id)
        creator_name = creator.display_name if creator else None

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

    owners: list[MemberAvatarPreviewOut] = []
    members: list[MemberAvatarPreviewOut] = []
    for m, u in rows:
        preview = _avatar_preview(u, m.role)
        if m.role == "owner":
            owners.append(preview)
        else:
            members.append(preview)

    items = list_schedule_items(db, user, ScheduleScope(kind="project", workspace_id=workspace_id, project_id=project_id))
    stats_raw = _count_dashboard(items)

    return ProjectDashboardOut(
        workspace_id=str(w.id),
        workspace_name=w.name,
        project_id=str(p.id),
        name=p.name,
        description=p.description,
        archived=p.archived,
        can_manage=user_can_manage_project(db, workspace_id, project_id, user),
        created_at=p.created_at,
        created_at_label=format_ymd_hm(p.created_at) if p.created_at else None,
        created_by_display_name=creator_name,
        members=ProjectMembersSummaryOut(
            total=len(rows),
            owner_count=len(owners),
            member_count=len(members),
            owners_preview=owners[:3],
            members_preview=members[:3],
        ),
        stats=ScheduleDashboardOut(**stats_raw),
    )
