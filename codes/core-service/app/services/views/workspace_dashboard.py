"""Workspace home view: dashboard aggregation and discussion feed."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.comment import Comment
from app.models.item import Item
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.views.workspace import (
    DiscussionViewItemOut,
    MemberPreviewOut,
    WorkspaceDashboardOut,
    WorkspaceDiscussionsViewOut,
    WorkspaceMembersSummaryOut,
    WorkspaceProjectCardOut,
    WorkspaceStatsViewOut,
)
from app.services.permissions import (
    WORKSPACE_OWNER,
    accessible_project_ids,
    require_workspace_member,
    user_can_manage_project,
)


def _format_discussion_exact(iso: datetime) -> str:
    if iso.tzinfo is None:
        iso = iso.replace(tzinfo=timezone.utc)
    local = iso.astimezone()
    return local.strftime("%Y/%m/%d %H:%M")


def _format_discussion_ago(iso: datetime) -> str:
    if iso.tzinfo is None:
        iso = iso.replace(tzinfo=timezone.utc)
    ms = datetime.now(timezone.utc).timestamp() * 1000 - iso.timestamp() * 1000
    if ms < 0:
        return "刚刚"
    minutes = int(ms // 60000)
    if minutes < 1:
        return "刚刚"
    if minutes < 60:
        return f"{minutes} 分钟前"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} 小时前"
    days = hours // 24
    if days < 7:
        return f"{days} 天前"
    return "一周前"


def _member_preview(m: WorkspaceMember, u: User) -> MemberPreviewOut:
    return MemberPreviewOut(id=str(m.id), display_name=u.display_name, email=u.email)


def build_workspace_dashboard(db: Session, workspace_id: uuid.UUID, user: User) -> WorkspaceDashboardOut:
    ws_m = require_workspace_member(db, workspace_id, user)
    w = db.get(Workspace, workspace_id)
    if not w:
        raise ValueError("workspace_not_found")

    creator_name: str | None = None
    if w.created_by_user_id:
        creator = db.get(User, w.created_by_user_id)
        creator_name = creator.display_name if creator else None

    can_edit = ws_m.role == WORKSPACE_OWNER
    allowed = accessible_project_ids(db, workspace_id, user, ws_m)

    member_rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.status == "active")
        .order_by(WorkspaceMember.created_at.asc())
    ).all()

    owners: list[MemberPreviewOut] = []
    participants: list[MemberPreviewOut] = []
    for m, u in member_rows:
        preview = _member_preview(m, u)
        if m.role == WORKSPACE_OWNER:
            owners.append(preview)
        else:
            participants.append(preview)

    stats = _workspace_stats(db, workspace_id, allowed)
    projects, total_active = _active_projects_with_progress(db, workspace_id, user, allowed)

    return WorkspaceDashboardOut(
        workspace_id=str(w.id),
        name=w.name,
        description=w.description,
        created_at=w.created_at,
        created_by_display_name=creator_name,
        can_edit_workspace=can_edit,
        current_user_id=str(user.id),
        members=WorkspaceMembersSummaryOut(
            total=len(owners) + len(participants),
            owner_count=len(owners),
            member_count=len(participants),
            owners_preview=owners[:3],
            members_preview=participants[:3],
        ),
        stats=stats,
        active_projects=projects,
        total_active_projects=total_active,
    )


def _workspace_stats(
    db: Session, workspace_id: uuid.UUID, allowed: set[uuid.UUID] | None
) -> WorkspaceStatsViewOut:
    if allowed is not None and not allowed:
        return WorkspaceStatsViewOut(
            project_count=0,
            total_task_count=0,
            todo_count=0,
            doing_count=0,
            done_count=0,
            archived_count=0,
            high_priority_count=0,
            health_percent=None,
        )

    proj_filter = [Project.workspace_id == workspace_id, Project.archived.is_(False)]
    item_filter = [Item.workspace_id == workspace_id]
    if allowed is not None:
        proj_filter.append(Project.id.in_(allowed))
        item_filter.append(Item.project_id.in_(allowed))

    project_count = db.scalar(select(func.count(Project.id)).where(*proj_filter)) or 0
    total_task_count = db.scalar(select(func.count(Item.id)).where(*item_filter)) or 0
    todo_count = db.scalar(select(func.count(Item.id)).where(*item_filter, Item.status == "todo")) or 0
    doing_count = db.scalar(select(func.count(Item.id)).where(*item_filter, Item.status == "doing")) or 0
    done_count = db.scalar(select(func.count(Item.id)).where(*item_filter, Item.status == "done")) or 0
    archived_count = db.scalar(select(func.count(Item.id)).where(*item_filter, Item.status == "archived")) or 0
    high_priority_count = db.scalar(select(func.count(Item.id)).where(*item_filter, Item.priority == "high")) or 0

    total = int(total_task_count)
    health = None
    if total > 0:
        health = round(((int(done_count) + int(archived_count)) / total) * 100)

    return WorkspaceStatsViewOut(
        project_count=int(project_count),
        total_task_count=total,
        todo_count=int(todo_count),
        doing_count=int(doing_count),
        done_count=int(done_count),
        archived_count=int(archived_count),
        high_priority_count=int(high_priority_count),
        health_percent=health,
    )


def _active_projects_with_progress(
    db: Session,
    workspace_id: uuid.UUID,
    user: User,
    allowed: set[uuid.UUID] | None,
) -> tuple[list[WorkspaceProjectCardOut], int]:
    q = (
        select(Project)
        .where(Project.workspace_id == workspace_id, Project.archived.is_(False))
        .order_by(Project.created_at.desc())
    )
    if allowed is not None:
        if not allowed:
            return [], 0
        q = q.where(Project.id.in_(allowed))
    rows = db.scalars(q).all()
    if not rows:
        return [], 0

    project_ids = [p.id for p in rows]
    progress_rows = db.execute(
        select(Item.project_id, Item.status, func.count(Item.id))
        .where(Item.workspace_id == workspace_id, Item.project_id.in_(project_ids))
        .group_by(Item.project_id, Item.status)
    ).all()

    progress: dict[str, dict[str, int]] = {}
    for pid, status_value, cnt in progress_rows:
        key = str(pid)
        d = progress.setdefault(key, {"todo_doing": 0, "done_archived": 0})
        st = str(status_value)
        if st in ("todo", "doing"):
            d["todo_doing"] += int(cnt)
        elif st in ("done", "archived"):
            d["done_archived"] += int(cnt)

    out: list[WorkspaceProjectCardOut] = []
    for p in rows:
        prog = progress.get(str(p.id), {"todo_doing": 0, "done_archived": 0})
        td = prog["todo_doing"]
        da = prog["done_archived"]
        total = td + da
        pct = 0 if total == 0 else round((da / total) * 100)
        can_manage = user_can_manage_project(db, workspace_id, p.id, user)
        out.append(
            WorkspaceProjectCardOut(
                id=str(p.id),
                name=p.name,
                description=p.description,
                can_manage=can_manage,
                todo_doing=td,
                done_archived=da,
                progress_percent=pct,
            )
        )
    return out, len(out)


def list_workspace_discussions(
    db: Session,
    workspace_id: uuid.UUID,
    user: User,
    *,
    limit: int = 20,
    offset: int = 0,
    incomplete_only: bool = False,
    include_comments: bool = True,
    include_replies: bool = True,
) -> WorkspaceDiscussionsViewOut:
    ws_m = require_workspace_member(db, workspace_id, user)
    allowed = accessible_project_ids(db, workspace_id, user, ws_m)
    if allowed is not None and not allowed:
        return WorkspaceDiscussionsViewOut(items=[], has_more=False)

    lim = max(1, min(limit, 80))
    off = max(0, offset)

    q = (
        select(Comment, User.display_name, Item.title, Item.id, Project.id, Project.name)
        .join(Item, Item.id == Comment.item_id)
        .join(Project, Project.id == Item.project_id)
        .join(User, User.id == Comment.author_user_id)
        .where(
            Comment.workspace_id == workspace_id,
            Comment.deleted_at.is_(None),
            Item.workspace_id == workspace_id,
        )
    )
    if allowed is not None:
        q = q.where(Item.project_id.in_(allowed))
    if incomplete_only:
        q = q.where(Comment.completion_status != "done")
    if include_comments and not include_replies:
        q = q.where(Comment.parent_comment_id.is_(None))
    elif include_replies and not include_comments:
        q = q.where(Comment.parent_comment_id.isnot(None))
    elif not include_comments and not include_replies:
        return WorkspaceDiscussionsViewOut(items=[], has_more=False)

    rows = db.execute(
        q.order_by(Comment.created_at.desc(), Comment.id.desc()).offset(off).limit(lim + 1)
    ).all()

    has_more = len(rows) > lim
    rows = rows[:lim]

    items: list[DiscussionViewItemOut] = []
    for c, name, ititle, iid, pid, pname in rows:
        items.append(
            DiscussionViewItemOut(
                id=str(c.id),
                body=c.body,
                created_at=c.created_at,
                created_at_exact_label=_format_discussion_exact(c.created_at),
                created_ago_label=_format_discussion_ago(c.created_at),
                author_user_id=str(c.author_user_id),
                author_display_name=name or "",
                is_reply=c.parent_comment_id is not None,
                completion_status=c.completion_status or "pending",
                is_author=str(c.author_user_id) == str(user.id),
                project_id=str(pid),
                project_name=pname or "",
                item_id=str(iid),
                item_title=ititle or "",
            )
        )

    return WorkspaceDiscussionsViewOut(items=items, has_more=has_more)
