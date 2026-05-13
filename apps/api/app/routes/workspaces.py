import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.activity import ActivityLog
from app.models.comment import Comment
from app.models.item import Item
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.workspace_cards import WorkspaceCardOut, WorkspaceCardUser
from app.schemas.workspace import RecentDiscussionOut, WorkspaceCreate, WorkspaceOut
from app.services.activity import log_activity

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


@router.get("", response_model=list[WorkspaceOut])
def list_workspaces(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.scalars(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.status == "active")
        .order_by(Workspace.created_at.desc())
    ).all()
    return [WorkspaceOut(id=str(w.id), name=w.name, description=w.description) for w in rows]


@router.get("/cards", response_model=list[WorkspaceCardOut])
def list_workspace_cards(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    workspaces = db.scalars(
        select(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.status == "active")
        .order_by(Workspace.created_at.desc())
    ).all()
    if not workspaces:
        return []

    workspace_ids = [w.id for w in workspaces]

    project_counts = dict(
        db.execute(
            select(Project.workspace_id, func.count(Project.id))
            .where(Project.workspace_id.in_(workspace_ids))
            .group_by(Project.workspace_id)
        ).all()
    )

    member_rows = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(WorkspaceMember.workspace_id.in_(workspace_ids))
        .order_by(WorkspaceMember.created_at.asc())
    ).all()

    item_status_rows = db.execute(
        select(Item.workspace_id, Item.status, func.count(Item.id))
        .where(Item.workspace_id.in_(workspace_ids), Item.status.in_(("todo", "doing", "done")))
        .group_by(Item.workspace_id, Item.status)
    ).all()
    item_counts_by_ws: dict[uuid.UUID, dict[str, int]] = {}
    for ws_id, st, cnt in item_status_rows:
        item_counts_by_ws.setdefault(ws_id, {})[str(st)] = int(cnt)

    admins_by_ws: dict[uuid.UUID, list[WorkspaceCardUser]] = {}
    contributors_by_ws: dict[uuid.UUID, list[WorkspaceCardUser]] = {}
    for m, u in member_rows:
        card_user = WorkspaceCardUser(
            id=str(u.id),
            email=u.email,
            display_name=u.display_name,
            role=m.role,
            status=m.status,
        )
        if m.status != "active":
            continue
        if m.role in ("owner", "admin"):
            admins_by_ws.setdefault(m.workspace_id, []).append(card_user)
        elif m.role in ("member", "guest"):
            contributors_by_ws.setdefault(m.workspace_id, []).append(card_user)

    out: list[WorkspaceCardOut] = []
    for w in workspaces:
        status_map = item_counts_by_ws.get(w.id, {})
        out.append(
            WorkspaceCardOut(
                id=str(w.id),
                name=w.name,
                description=w.description,
                project_count=int(project_counts.get(w.id, 0)),
                todo_count=int(status_map.get("todo", 0)),
                doing_count=int(status_map.get("doing", 0)),
                done_count=int(status_map.get("done", 0)),
                admins=admins_by_ws.get(w.id, []),
                contributors=contributors_by_ws.get(w.id, []),
            )
        )
    return out


@router.post("", response_model=WorkspaceOut, status_code=status.HTTP_201_CREATED)
def create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    w = Workspace(name=payload.name, description=payload.description, created_by_user_id=user.id)
    db.add(w)
    db.flush()

    owner = WorkspaceMember(workspace_id=w.id, user_id=user.id, role="owner", status="active")
    db.add(owner)
    log_activity(
        db,
        workspace_id=w.id,
        actor_user_id=user.id,
        entity_type="workspace",
        entity_id=w.id,
        action="create",
        metadata={"name": w.name},
    )
    db.commit()
    return WorkspaceOut(
        id=str(w.id),
        name=w.name,
        description=w.description,
        created_at=w.created_at,
        created_by_user_id=str(w.created_by_user_id),
        created_by_display_name=user.display_name,
    )


@router.get("/{workspace_id}", response_model=WorkspaceOut)
def get_workspace(workspace_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "active",
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_a_member")

    w = db.get(Workspace, workspace_id)
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    creator = db.get(User, w.created_by_user_id)
    return WorkspaceOut(
        id=str(w.id),
        name=w.name,
        description=w.description,
        created_at=w.created_at,
        created_by_user_id=str(w.created_by_user_id),
        created_by_display_name=creator.display_name if creator else None,
    )


@router.get("/{workspace_id}/recent-discussions", response_model=list[RecentDiscussionOut])
def list_recent_discussions(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    limit: int = 20,
    offset: int = 0,
):
    m = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "active",
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_a_member")

    lim = max(1, min(limit, 80))
    off = max(0, offset)
    rows = db.execute(
        select(Comment, User.display_name, Item.title, Item.id, Project.id, Project.name)
        .join(Item, Item.id == Comment.item_id)
        .join(Project, Project.id == Item.project_id)
        .join(User, User.id == Comment.author_user_id)
        .where(
            Comment.workspace_id == workspace_id,
            Comment.deleted_at.is_(None),
            Item.workspace_id == workspace_id,
        )
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .offset(off)
        .limit(lim)
    ).all()

    return [
        RecentDiscussionOut(
            id=str(c.id),
            body=c.body,
            created_at=c.created_at,
            author_display_name=name or "",
            is_reply=c.parent_comment_id is not None,
            completion_status=c.completion_status or "pending",
            project_id=str(pid),
            project_name=pname or "",
            item_id=str(iid),
            item_title=ititle or "",
        )
        for c, name, ititle, iid, pid, pname in rows
    ]


@router.get("/{workspace_id}/stats")
def get_workspace_stats(workspace_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "active",
        )
    )
    if not m:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_a_member")

    project_count = db.scalar(select(func.count(Project.id)).where(Project.workspace_id == workspace_id)) or 0
    total_task_count = db.scalar(select(func.count(Item.id)).where(Item.workspace_id == workspace_id)) or 0
    todo_count = db.scalar(
        select(func.count(Item.id)).where(Item.workspace_id == workspace_id, Item.status == "todo")
    ) or 0
    doing_count = db.scalar(
        select(func.count(Item.id)).where(Item.workspace_id == workspace_id, Item.status == "doing")
    ) or 0
    high_priority_count = db.scalar(
        select(func.count(Item.id)).where(Item.workspace_id == workspace_id, Item.priority == "high")
    ) or 0

    return {
        "project_count": int(project_count),
        "total_task_count": int(total_task_count),
        "todo_count": int(todo_count),
        "doing_count": int(doing_count),
        "high_priority_count": int(high_priority_count),
    }


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(workspace_id: uuid.UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    m = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "active",
        )
    )
    if not m or m.role not in ("owner", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_allowed")

    w = db.get(Workspace, workspace_id)
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    # Delete activity logs first to avoid FK constraint failures.
    db.query(ActivityLog).filter(ActivityLog.workspace_id == workspace_id).delete(synchronize_session=False)

    db.delete(w)
    db.commit()
    return None

