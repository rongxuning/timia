import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.comment import Comment
from app.models.item import Item
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentOut, CommentUpdate
from app.services.activity import log_activity
from app.services.permissions import can_moderate_comments, require_project_content_access

router = APIRouter(
    prefix="/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/comments",
    tags=["comments"],
)


def _require_item(db: Session, workspace_id: uuid.UUID, item_id: uuid.UUID) -> Item:
    i = db.get(Item, item_id)
    if not i or i.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item_not_found")
    return i


def _comment_out(c: Comment, author_display_name: str) -> CommentOut:
    return CommentOut(
        id=str(c.id),
        author_user_id=str(c.author_user_id),
        author_display_name=author_display_name,
        body=c.body,
        created_at=c.created_at,
        deleted_at=c.deleted_at,
        parent_comment_id=str(c.parent_comment_id) if c.parent_comment_id else None,
        completion_status=c.completion_status,
    )


@router.get("", response_model=list[CommentOut])
def list_comments(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    i = _require_item(db, workspace_id, item_id)
    if i.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item_not_found")

    rows = db.execute(
        select(Comment, User.display_name)
        .join(User, User.id == Comment.author_user_id)
        .where(
            Comment.item_id == item_id,
            Comment.workspace_id == workspace_id,
            Comment.deleted_at.is_(None),
        )
        .order_by(Comment.created_at.asc())
    ).all()
    return [_comment_out(c, name) for c, name in rows]


@router.post("", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    require_project_content_access(db, workspace_id, project_id, user)
    i = _require_item(db, workspace_id, item_id)
    if i.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item_not_found")

    parent_id = payload.parent_comment_id
    if parent_id is not None:
        p = db.get(Comment, parent_id)
        if (
            not p
            or p.item_id != item_id
            or p.workspace_id != workspace_id
            or p.deleted_at is not None
        ):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="parent_comment_not_found")
        if p.parent_comment_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="cannot_reply_to_reply",
            )

    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_body")

    c = Comment(
        workspace_id=workspace_id,
        item_id=item_id,
        author_user_id=user.id,
        body=body,
        parent_comment_id=parent_id,
        completion_status="pending",
    )
    db.add(c)
    db.flush()
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="comment",
        entity_id=c.id,
        action="add_comment",
        metadata={"item_id": str(item_id), "project_id": str(project_id)},
    )
    db.commit()
    db.refresh(c)
    author_name = db.scalar(select(User.display_name).where(User.id == user.id)) or ""
    return _comment_out(c, author_name)


@router.patch("/{comment_id}", response_model=CommentOut)
def patch_comment(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    comment_id: uuid.UUID,
    payload: CommentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws, pm = require_project_content_access(db, workspace_id, project_id, user)
    i = _require_item(db, workspace_id, item_id)
    if i.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item_not_found")

    c = db.get(Comment, comment_id)
    if not c or c.item_id != item_id or c.workspace_id != workspace_id or c.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    if c.author_user_id != user.id and not can_moderate_comments(ws, pm):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    c.completion_status = payload.completion_status
    db.commit()
    db.refresh(c)
    author_name = db.scalar(select(User.display_name).where(User.id == c.author_user_id)) or ""
    return _comment_out(c, author_name)


@router.delete("/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    comment_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ws, pm = require_project_content_access(db, workspace_id, project_id, user)
    i = _require_item(db, workspace_id, item_id)
    if i.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="item_not_found")

    c = db.get(Comment, comment_id)
    if not c or c.item_id != item_id or c.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")

    if c.author_user_id != user.id and not can_moderate_comments(ws, pm):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    db.delete(c)
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="comment",
        entity_id=c.id,
        action="delete_comment",
        metadata={"item_id": str(item_id), "project_id": str(project_id)},
    )
    db.commit()
    return None
