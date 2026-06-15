import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.task_drawer import ItemDetailViewOut, TaskDrawerContextOut
from app.services.views.task_drawer import build_item_detail_view, build_task_drawer_context

router = APIRouter(prefix="/views/workspace", tags=["views-task"])


@router.get("/{workspace_id}/projects/{project_id}/task-drawer-context", response_model=TaskDrawerContextOut)
def task_drawer_context(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return build_task_drawer_context(db, workspace_id, project_id, user)
    except ValueError as e:
        if str(e) == "project_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
        raise


@router.get("/{workspace_id}/projects/{project_id}/items/{item_id}/detail", response_model=ItemDetailViewOut)
def item_detail_view(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return build_item_detail_view(db, workspace_id, project_id, item_id, user)
    except ValueError as e:
        if str(e) == "item_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
        raise
