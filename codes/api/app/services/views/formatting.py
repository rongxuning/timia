"""Shared display formatting for view APIs."""

from __future__ import annotations

from datetime import datetime, timezone

ENTITY_TYPE_LABELS: dict[str, str] = {
    "workspace": "工作空间",
    "project": "项目",
    "item": "任务",
    "comment": "评论",
    "member": "成员",
    "user": "用户",
    "activity": "活动",
}


def format_ymd_hm(value: datetime | str) -> str:
    if isinstance(value, str):
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        d = value
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    local = d.astimezone()
    return local.strftime("%Y-%m-%d %H:%M")


def entity_type_label(entity_type: str) -> str:
    key = entity_type.strip().lower()
    return ENTITY_TYPE_LABELS.get(key, entity_type)


def short_id(value: str, max_len: int = 12) -> str:
    if len(value) <= max_len:
        return value
    return f"{value[:8]}…"
