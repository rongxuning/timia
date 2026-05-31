import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_system_admin
from app.db.deps import get_db
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.user import (
    MembershipBrief,
    ProjectBrief,
    UserOut,
    UserWorkspaceOut,
    WorkspaceBrief,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_system_admin)):
    rows = db.execute(
        select(
            User,
            func.count(WorkspaceMember.id).filter(WorkspaceMember.status == "active").label("workspace_count"),
        )
        .outerjoin(WorkspaceMember, WorkspaceMember.user_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    ).all()

    out: list[UserOut] = []
    for u, workspace_count in rows:
        out.append(
            UserOut(
                id=str(u.id),
                email=u.email,
                display_name=u.display_name,
                status=u.status,
                system_role=u.system_role,
                workspace_count=int(workspace_count or 0),
                created_at=u.created_at,
            )
        )
    return out


@router.get("/{user_id}/workspaces", response_model=list[UserWorkspaceOut])
def list_user_workspaces(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    member_rows = db.execute(
        select(WorkspaceMember, Workspace)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == user_id)
        .order_by(WorkspaceMember.created_at.desc())
    ).all()

    workspace_ids = [m.workspace_id for (m, _w) in member_rows]
    projects_by_workspace: dict[uuid.UUID, list[ProjectBrief]] = {}
    if workspace_ids:
        project_rows = db.scalars(
            select(Project).where(Project.workspace_id.in_(workspace_ids)).order_by(Project.created_at.desc())
        ).all()
        for p in project_rows:
            projects_by_workspace.setdefault(p.workspace_id, []).append(
                ProjectBrief(
                    id=str(p.id),
                    name=p.name,
                    description=p.description,
                    archived=p.archived,
                )
            )

    out: list[UserWorkspaceOut] = []
    for m, w in member_rows:
        out.append(
            UserWorkspaceOut(
                workspace=WorkspaceBrief(id=str(w.id), name=w.name, description=w.description),
                membership=MembershipBrief(id=str(m.id), role=m.role, status=m.status),
                projects=projects_by_workspace.get(w.id, []),
            )
        )
    return out

