"""Default scenarios and template rendering."""

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models._mixins import utcnow
from app.models.notification import NotificationScenario

# Internal row written once push defaults have been applied. Hidden from the
# admin scenario list so an operator can turn push off afterwards.
PUSH_BACKFILL_KEY = "__default_push_backfill_v1"

DEFAULT_SCENARIOS: list[dict[str, object]] = [
    {
        "key": "task_self_join",
        "enabled": True,
        "push_enabled": True,
        "title_template": "{actor_name} 加入了任务",
        "body_template": "{actor_name} 将自己加入了「{task_title}」的参与人",
    },
    {
        "key": "task_member_added",
        "enabled": True,
        "push_enabled": True,
        "title_template": "你被加入了任务",
        "body_template": "{actor_name} 将你加入了「{task_title}」的参与人",
    },
    {
        "key": "workspace_member_added",
        "enabled": True,
        "push_enabled": True,
        "title_template": "你被加入了空间",
        "body_template": "{actor_name} 将你加入了空间「{workspace_name}」",
    },
    {
        "key": "project_member_added",
        "enabled": True,
        "push_enabled": True,
        "title_template": "你被加入了项目",
        "body_template": "{actor_name} 将你加入了项目「{project_name}」",
    },
    {
        "key": "task_created_in_project",
        "enabled": True,
        "push_enabled": True,
        "title_template": "项目有新任务",
        "body_template": "{actor_name} 在「{project_name}」创建了任务「{task_title}」",
    },
    {
        "key": "task_commented",
        "enabled": True,
        "push_enabled": True,
        "title_template": "任务有新评论",
        "body_template": "{actor_name} 评论了「{task_title}」：{comment_excerpt}",
    },
]

SCENARIO_ORDER = [str(row["key"]) for row in DEFAULT_SCENARIOS]
DEFAULT_SCENARIO_KEYS = tuple(SCENARIO_ORDER)


class _Missing(dict):
    def __missing__(self, key: str) -> str:
        return ""


def render_template(template: str, variables: dict[str, str]) -> str:
    try:
        return template.format_map(_Missing(variables))
    except (ValueError, IndexError, KeyError):
        return template


def ensure_default_scenarios(db: Session) -> None:
    """Insert missing built-in scenarios and turn their push on once.

    Databases seeded while every default had ``push_enabled`` false keep that
    value until this runs. The first call flips those built-in rows on and
    records ``PUSH_BACKFILL_KEY``. Later calls leave an admin's off switch
    alone. Alembic ``0003_default_scenario_push`` does the same update at
    deploy time and writes the same marker.
    """
    existing = {row.key: row for row in db.scalars(select(NotificationScenario)).all()}
    now = utcnow()
    backfill = PUSH_BACKFILL_KEY not in existing
    for spec in DEFAULT_SCENARIOS:
        key = str(spec["key"])
        current = existing.get(key)
        if current is None:
            db.add(
                NotificationScenario(
                    key=key,
                    enabled=bool(spec["enabled"]),
                    push_enabled=bool(spec["push_enabled"]),
                    title_template=str(spec["title_template"]),
                    body_template=str(spec["body_template"]),
                    updated_at=now,
                )
            )
            continue
        if backfill and bool(spec["push_enabled"]) and not current.push_enabled:
            current.push_enabled = True
            current.updated_at = now
    db.flush()
    if backfill:
        _record_push_backfill(db, now)


def _record_push_backfill(db: Session, now) -> None:
    try:
        with db.begin_nested():
            db.add(
                NotificationScenario(
                    key=PUSH_BACKFILL_KEY,
                    enabled=False,
                    push_enabled=True,
                    title_template="",
                    body_template="",
                    updated_at=now,
                )
            )
            db.flush()
    except IntegrityError:
        return
