"""create notification tables

Revision ID: 0001_notif_tables
Revises:
Create Date: 2026-10-26

"""

import sqlalchemy as sa
from alembic import op

revision = "0001_notif_tables"
down_revision = None
branch_labels = None
depends_on = None

SCENARIOS = [
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
]


def upgrade():
    op.create_table(
        "notif_scenarios",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("title_template", sa.Text(), nullable=False),
        sa.Column("body_template", sa.Text(), nullable=False),
        sa.Column("push_enabled", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    scenarios = sa.table(
        "notif_scenarios",
        sa.column("key", sa.String),
        sa.column("enabled", sa.Boolean),
        sa.column("title_template", sa.Text),
        sa.column("body_template", sa.Text),
        sa.column("push_enabled", sa.Boolean),
    )
    op.bulk_insert(scenarios, SCENARIOS)

    op.create_table(
        "notif_notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("sender_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("link", sa.String(length=500), nullable=True),
        sa.Column("audience_type", sa.String(length=32), nullable=False),
        sa.Column("audience_params", sa.JSON(), nullable=False),
        sa.Column("timing", sa.String(length=20), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("scenario_key", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_notif_notifications_scenario", "notif_notifications", ["scenario_key"])
    op.create_index("idx_notif_notifications_status", "notif_notifications", ["status", "scheduled_at"])

    op.create_table(
        "notif_deliveries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "notification_id",
            sa.Uuid(),
            sa.ForeignKey("notif_notifications.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("push_status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("notification_id", "user_id", name="uq_notif_deliveries_notification_user"),
    )
    op.create_index("idx_notif_deliveries_user_read", "notif_deliveries", ["user_id", "read_at"])


def downgrade():
    op.drop_index("idx_notif_deliveries_user_read", table_name="notif_deliveries")
    op.drop_table("notif_deliveries")
    op.drop_index("idx_notif_notifications_status", table_name="notif_notifications")
    op.drop_index("idx_notif_notifications_scenario", table_name="notif_notifications")
    op.drop_table("notif_notifications")
    op.drop_table("notif_scenarios")
