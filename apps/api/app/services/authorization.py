import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.models.workspace import WorkspaceMember


def require_workspace_member(workspace_id: uuid.UUID):
    def _dep(
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> WorkspaceMember:
        member = db.scalar(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user.id,
                WorkspaceMember.status == "active",
            )
        )
        if not member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="not_a_member")
        return member

    return _dep


def require_workspace_role(workspace_id: uuid.UUID, allowed_roles: set[str]):
    """allowed_roles should use values from app.services.permissions (workspace: owner | member)."""

    def _dep(member: WorkspaceMember = Depends(require_workspace_member(workspace_id))) -> WorkspaceMember:
        if member.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")
        return member

    return _dep

