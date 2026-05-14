"""Development-only introspection for documentation pages. Gated by settings.enable_dev_db_tables."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.models import ActivityLog, Comment, Item, Project, ProjectMember, User, Workspace, WorkspaceMember

router = APIRouter(prefix="/dev", tags=["dev"])


def _serialize_value(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, datetime | date):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, dict):
        return {str(k): _serialize_value(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_serialize_value(v) for v in val]
    if isinstance(val, (bytes, memoryview)):
        return f"<{len(val)} bytes>"
    return val


def _orm_row_dict(model_cls: type, row: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    mapper = sa_inspect(model_cls)
    for col in mapper.mapper.column_attrs:
        key = col.key
        val = getattr(row, key)
        if model_cls is User and key == "password_hash":
            out[key] = "***"
        else:
            out[key] = _serialize_value(val)
    return out


_TABLE_ORDER: list[tuple[str, type]] = [
    ("users", User),
    ("workspaces", Workspace),
    ("workspace_members", WorkspaceMember),
    ("projects", Project),
    ("project_members", ProjectMember),
    ("items", Item),
    ("comments", Comment),
    ("activity_log", ActivityLog),
]

_ROW_LIMIT = 200


@router.get("/db-tables")
def list_db_tables(db: Session = Depends(get_db)) -> dict[str, Any]:
    if not settings.enable_dev_db_tables:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="dev_db_tables_disabled",
        )

    tables: list[dict[str, Any]] = []
    for table_name, model_cls in _TABLE_ORDER:
        q = select(model_cls)
        if hasattr(model_cls, "created_at"):
            q = q.order_by(model_cls.created_at.desc())  # type: ignore[attr-defined]
        rows = db.scalars(q.limit(_ROW_LIMIT)).all()
        if not rows:
            columns = [c.key for c in sa_inspect(model_cls).mapper.column_attrs]
            tables.append({"name": table_name, "columns": columns, "rows": []})
            continue
        first = _orm_row_dict(model_cls, rows[0])
        columns = list(first.keys())
        dict_rows = [_orm_row_dict(model_cls, r) for r in rows]
        tables.append({"name": table_name, "columns": columns, "rows": dict_rows})

    return {"tables": tables}
