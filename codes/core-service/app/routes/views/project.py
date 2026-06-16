import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.members_page import ProjectMembersPageOut
from app.schemas.views.project import ProjectDashboardOut
from app.services.views.project_dashboard import build_project_dashboard
from app.services.views.project_members_page import build_project_members_page

router = APIRouter(prefix="/views/workspace", tags=["views-project"])


@router.get("/{workspace_id}/projects/{project_id}/dashboard", response_model=ProjectDashboardOut)
def project_dashboard(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return build_project_dashboard(db, workspace_id, project_id, user)
    except ValueError as e:
        if str(e) == "project_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
        raise


@router.get("/{workspace_id}/projects/{project_id}/members-page", response_model=ProjectMembersPageOut)
def project_members_page(
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        return build_project_members_page(db, workspace_id, project_id, user)
    except ValueError as e:
        if str(e) == "project_not_found":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found") from e
        raise
