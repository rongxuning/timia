"""Task drawer read models: context + item detail with comments."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.item import Item
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.views.task_drawer import (
    ItemDetailCommentOut,
    ItemDetailViewOut,
    TaskDrawerContextOut,
    TaskDrawerMemberOptionOut,
)
from app.services.item_api import build_item_out
from app.services.permissions import require_project_content_access
from app.services.views.formatting import format_ymd_hm
from app.services.views.project_members_page import _ensure_project_creator_as_owner


def build_task_drawer_context(
    db: Session,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    user: User,
) -> TaskDrawerContextOut:
    require_project_content_access(db, workspace_id, project_id, user)
    w = db.get(Workspace, workspace_id)
    p = db.get(Project, project_id)
    if not w or not p or p.workspace_id != workspace_id:
        raise ValueError("project_not_found")

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
        .order_by(User.display_name.asc(), User.email.asc())
    ).all()

    return TaskDrawerContextOut(
        workspace_id=str(w.id),
        workspace_name=w.name,
        project_id=str(p.id),
        project_name=p.name,
        current_user_id=str(user.id),
        current_user_display_name=user.display_name,
        member_options=[
            TaskDrawerMemberOptionOut(user_id=str(u.id), email=u.email, display_name=u.display_name) for _m, u in rows
        ],
    )


def build_item_detail_view(
    db: Session,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    user: User,
) -> ItemDetailViewOut:
    require_project_content_access(db, workspace_id, project_id, user)
    item = db.get(Item, item_id)
    if not item or item.workspace_id != workspace_id or item.project_id != project_id:
        raise ValueError("item_not_found")

    base = build_item_out(db, item)
    comment_rows = db.execute(
        select(Comment, User.display_name)
        .join(User, User.id == Comment.author_user_id)
        .where(
            Comment.item_id == item_id,
            Comment.workspace_id == workspace_id,
            Comment.deleted_at.is_(None),
        )
        .order_by(Comment.created_at.asc())
    ).all()

    comments: list[ItemDetailCommentOut] = []
    for c, author_name in comment_rows:
        comments.append(
            ItemDetailCommentOut(
                id=str(c.id),
                author_user_id=str(c.author_user_id),
                author_display_name=author_name,
                body=c.body,
                created_at=c.created_at,
                created_at_label=format_ymd_hm(c.created_at),
                deleted_at=c.deleted_at,
                parent_comment_id=str(c.parent_comment_id) if c.parent_comment_id else None,
                completion_status=c.completion_status,
                is_author=c.author_user_id == user.id,
            )
        )

    return ItemDetailViewOut(
        workspace_id=str(item.workspace_id),
        project_id=str(item.project_id),
        **base.model_dump(),
        comments=comments,
    )
