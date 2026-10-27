"""Default scenarios and template rendering."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models._mixins import utcnow
from app.models.notification import NotificationScenario

DEFAULT_SCENARIOS: list[dict[str, object]] = [
    {
        "key": "task_self_join",
        "enabled": True,
        "push_enabled": False,
        "title_template": "{actor_name} 加入了任务",
        "body_template": "{actor_name} 将自己加入了「{task_title}」的参与人",
    },
    {
        "key": "task_member_added",
        "enabled": True,
        "push_enabled": False,
        "title_template": "你被加入了任务",
        "body_template": "{actor_name} 将你加入了「{task_title}」的参与人",
    },
    {
        "key": "workspace_member_added",
        "enabled": True,
        "push_enabled": False,
        "title_template": "你被加入了空间",
        "body_template": "{actor_name} 将你加入了空间「{workspace_name}」",
    },
    {
        "key": "project_member_added",
        "enabled": True,
        "push_enabled": False,
        "title_template": "你被加入了项目",
        "body_template": "{actor_name} 将你加入了项目「{project_name}」",
    },
    {
        "key": "task_created_in_project",
        "enabled": True,
        "push_enabled": False,
        "title_template": "项目有新任务",
        "body_template": "{actor_name} 在「{project_name}」创建了任务「{task_title}」",
    },
    {
        "key": "task_commented",
        "enabled": True,
        "push_enabled": False,
        "title_template": "任务有新评论",
        "body_template": "{actor_name} 评论了「{task_title}」：{comment_excerpt}",
    },
]

SCENARIO_ORDER = [str(row["key"]) for row in DEFAULT_SCENARIOS]


class _Missing(dict):
    def __missing__(self, key: str) -> str:
        return ""


def render_template(template: str, variables: dict[str, str]) -> str:
    try:
        return template.format_map(_Missing(variables))
    except (ValueError, IndexError, KeyError):
        return template


def ensure_default_scenarios(db: Session) -> None:
    existing = set(db.scalars(select(NotificationScenario.key)).all())
    now = utcnow()
    for row in DEFAULT_SCENARIOS:
        key = str(row["key"])
        if key in existing:
            continue
        db.add(
            NotificationScenario(
                key=key,
                enabled=bool(row["enabled"]),
                push_enabled=bool(row["push_enabled"]),
                title_template=str(row["title_template"]),
                body_template=str(row["body_template"]),
                updated_at=now,
            )
        )
    db.flush()
