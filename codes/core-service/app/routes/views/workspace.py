import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.workspace import WorkspaceDashboardOut, WorkspaceDiscussionsViewOut
from app.schemas.views.activity import WorkspaceActivityViewOut
from app.schemas.views.members_page import WorkspaceMembersPageOut
from app.services.views.workspace_dashboard import build_workspace_dashboard, list_workspace_discussions
from app.services.views.workspace_activity import build_workspace_activity_view
from app.services.views.workspace_members_page import build_workspace_members_page

router = APIRouter(prefix="/views/workspace", tags=["views-workspace"])


@router.get("/{workspace_id}/dashboard", response_model=WorkspaceDashboardOut)
def workspace_dashboard(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return build_workspace_dashboard(db, workspace_id, user)
    except ValueError as e:
        if str(e) == "workspace_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
        raise


@router.get("/{workspace_id}/discussions", response_model=WorkspaceDiscussionsViewOut)
def workspace_discussions(
    workspace_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=80),
    offset: int = Query(0, ge=0),
    incomplete_only: bool = Query(False),
    include_comments: bool = Query(True),
    include_replies: bool = Query(True),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list_workspace_discussions(
        db,
        workspace_id,
        user,
        limit=limit,
        offset=offset,
        incomplete_only=incomplete_only,
        include_comments=include_comments,
        include_replies=include_replies,
    )


@router.get("/{workspace_id}/activity", response_model=WorkspaceActivityViewOut)
def workspace_activity(
    workspace_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return build_workspace_activity_view(db, workspace_id, user, limit=limit)
    except ValueError as e:
        if str(e) == "workspace_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
        raise


@router.get("/{workspace_id}/members-page", response_model=WorkspaceMembersPageOut)
def workspace_members_page(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return build_workspace_members_page(db, workspace_id, user)
    except ValueError as e:
        if str(e) == "workspace_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
        raise
