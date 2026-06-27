"""Load schedule task rows for view APIs (scoped, no full-workspace dumps)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.models.item import Item
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.schemas.views.schedule import ScheduleTaskItemOut
from app.services.item_api import build_item_out
from app.services.permissions import WORKSPACE_OWNER, require_project_content_access


@dataclass(frozen=True)
class ScheduleScope:
    kind: str  # "me" | "project"
    workspace_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None


def list_schedule_items(db: Session, user: User, scope: ScheduleScope) -> list[ScheduleTaskItemOut]:
    if scope.kind == "me":
        return _list_my_schedule_items(db, user)
    if scope.kind == "project":
        if scope.workspace_id is None or scope.project_id is None:
            raise ValueError("project scope requires workspace_id and project_id")
        require_project_content_access(db, scope.workspace_id, scope.project_id, user)
        return _list_project_schedule_items(db, scope.workspace_id, scope.project_id)
    raise ValueError(f"unsupported scope: {scope.kind}")


def _to_schedule_item(db: Session, item: Item, workspace: Workspace, project: Project) -> ScheduleTaskItemOut:
    base = build_item_out(db, item)
    return ScheduleTaskItemOut(
        **base.model_dump(),
        workspace_id=str(workspace.id),
        workspace_name=workspace.name,
        project_id=str(project.id),
        project_name=project.name,
    )


def _list_my_schedule_items(db: Session, user: User) -> list[ScheduleTaskItemOut]:
    owned_ws_subq = select(WorkspaceMember.workspace_id).where(
        WorkspaceMember.user_id == user.id,
        WorkspaceMember.status == "active",
        WorkspaceMember.role == WORKSPACE_OWNER,
    )

    pm_exists = exists(
        select(ProjectMember.id).where(
            ProjectMember.project_id == Item.project_id,
            ProjectMember.user_id == user.id,
            ProjectMember.status == "active",
        )
    )

    access = or_(Item.workspace_id.in_(owned_ws_subq), pm_exists)
    involved = or_(
        Item.assignee_user_id == user.id,
        Item.participant_user_ids.contains([user.id]),
    )

    rows = db.execute(
        select(Item, Project, Workspace)
        .join(Project, Project.id == Item.project_id)
        .join(Workspace, Workspace.id == Item.workspace_id)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Item.workspace_id)
        .where(
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "active",
            access,
            involved,
        )
        .order_by(Item.created_at.desc())
    ).all()

    return [_to_schedule_item(db, i, w, p) for i, p, w in rows]


def _list_project_schedule_items(
    db: Session, workspace_id: uuid.UUID, project_id: uuid.UUID
) -> list[ScheduleTaskItemOut]:
    project = db.get(Project, project_id)
    workspace = db.get(Workspace, workspace_id)
    if not project or project.workspace_id != workspace_id or not workspace:
        return []

    rows = db.scalars(
        select(Item)
        .where(Item.workspace_id == workspace_id, Item.project_id == project_id)
        .order_by(Item.created_at.desc())
    ).all()
    return [_to_schedule_item(db, i, workspace, project) for i in rows]


def _count_dashboard(items: list[ScheduleTaskItemOut]) -> dict:
    counts = {"todo": 0, "doing": 0, "done": 0, "archived": 0}

    for it in items:
        key = it.status if it.status in counts else "todo"
        counts[key] += 1

    total = len(items)
    done_archived = counts["done"] + counts["archived"]
    health = None if total == 0 else round((done_archived / total) * 100)

    return {
        "task_total": total,
        "todo_count": counts["todo"],
        "doing_count": counts["doing"],
        "done_count": counts["done"],
        "archived_count": counts["archived"],
        "health_percent": health,
    }


def build_my_schedule_dashboard(db: Session, user: User, items: list[ScheduleTaskItemOut]) -> dict:
    workspace_ids: set[str] = set()
    project_keys: set[str] = set()
    for it in items:
        workspace_ids.add(it.workspace_id)
        project_keys.add(f"{it.workspace_id}:{it.project_id}")

    base = _count_dashboard(items)
    return {
        **base,
        "display_name": user.display_name,
        "email": user.email,
        "workspace_count": len(workspace_ids),
        "project_count": len(project_keys),
    }


def parse_month(month: str) -> tuple[int, int]:
    """Parse YYYY-MM into (year, month)."""
    parts = month.split("-")
    if len(parts) != 2:
        raise ValueError("month must be YYYY-MM")
    year = int(parts[0])
    mon = int(parts[1])
    if mon < 1 or mon > 12:
        raise ValueError("invalid month")
    return year, mon


def month_default() -> str:
    now = datetime.now()
    return f"{now.year:04d}-{now.month:02d}"


def anchor_default() -> str:
    return date.today().isoformat()


def parse_anchor(anchor: str) -> date:
    try:
        return date.fromisoformat(anchor.strip())
    except ValueError as e:
        raise ValueError("anchor must be YYYY-MM-DD") from e
