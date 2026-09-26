"""Workspaces and projects the current user can place a parsed task into."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services.natural_language_placement import WorkspaceCatalog
from app.services.permissions import WORKSPACE_OWNER


def load_workspace_catalog(db: Session, user: User) -> list[WorkspaceCatalog]:
    memberships = db.execute(
        select(WorkspaceMember, Workspace)
        .join(Workspace, Workspace.id == WorkspaceMember.workspace_id)
        .where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "active",
        )
        .order_by(Workspace.name.asc())
    ).all()
    if not memberships:
        return []

    owner_ids = [
        workspace.id for member, workspace in memberships if member.role == WORKSPACE_OWNER
    ]
    member_ids = [
        workspace.id for member, workspace in memberships if member.role != WORKSPACE_OWNER
    ]
    projects_by_workspace: dict = defaultdict(list)

    if owner_ids:
        for project in db.scalars(
            select(Project)
            .where(Project.workspace_id.in_(owner_ids), Project.archived.is_(False))
            .order_by(Project.name.asc())
        ).all():
            projects_by_workspace[project.workspace_id].append(project.name)

    if member_ids:
        for project in db.scalars(
            select(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(
                Project.workspace_id.in_(member_ids),
                Project.archived.is_(False),
                ProjectMember.user_id == user.id,
                ProjectMember.status == "active",
            )
            .order_by(Project.name.asc())
        ).all():
            projects_by_workspace[project.workspace_id].append(project.name)

    catalog: list[WorkspaceCatalog] = []
    for _, workspace in memberships:
        seen: set[str] = set()
        names: list[str] = []
        for name in projects_by_workspace.get(workspace.id, []):
            if name in seen:
                continue
            seen.add(name)
            names.append(name)
        catalog.append(WorkspaceCatalog(name=workspace.name, projects=tuple(names)))
    return catalog
