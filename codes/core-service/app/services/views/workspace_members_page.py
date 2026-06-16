"""Workspace members management page view."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.views.members_page import AssignableUserOut, MembershipRowOut, WorkspaceMembersPageOut
from app.services.permissions import WORKSPACE_OWNER, require_workspace_member


def build_workspace_members_page(db: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceMembersPageOut:
    ws_m = require_workspace_member(db, workspace_id, user)
    w = db.get(Workspace, workspace_id)
    if not w:
        raise ValueError("workspace_not_found")

    creator_id = w.created_by_user_id
    member_rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id)
        .order_by(WorkspaceMember.created_at.asc())
    ).all()

    members: list[MembershipRowOut] = []
    for m, u in member_rows:
        if m.status != "active":
            continue
        members.append(
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

    assignable = db.scalars(
        select(User).where(User.status == "active").order_by(User.display_name.asc(), User.email.asc())
    ).all()
    assignable_users = [
        AssignableUserOut(user_id=str(u.id), email=u.email, display_name=u.display_name) for u in assignable
    ]

    return WorkspaceMembersPageOut(
        workspace_id=str(w.id),
        name=w.name,
        description=w.description,
        created_by_user_id=str(creator_id) if creator_id else None,
        current_user_id=str(user.id),
        can_manage_workspace=ws_m.role == WORKSPACE_OWNER,
        members=members,
        assignable_users=assignable_users,
    )
