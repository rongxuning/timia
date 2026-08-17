"""add plan domain tables and item source FKs

Revision ID: 0023_plan_domain
Revises: 0022_sticky_updated_at
Create Date: 2026-08-17

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "0023_plan_domain"
down_revision = "0022_sticky_updated_at"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "plan_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=10000), nullable=True),
        sa.Column("creator_intro", sa.String(length=10000), nullable=True),
        sa.Column("usage_kind", sa.String(length=20), nullable=False),
        sa.Column("period_kind", sa.String(length=20), nullable=False),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column("use_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )

    op.create_table(
        "plan_slots",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rel_month", sa.Integer(), nullable=True),
        sa.Column("rel_day", sa.Integer(), nullable=False),
        sa.Column("start_minute", sa.Integer(), nullable=False),
        sa.Column("end_minute", sa.Integer(), nullable=False),
        sa.Column(
            "all_day",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.String(length=10000), nullable=True),
        sa.Column("details", sa.String(length=10000), nullable=True),
        sa.Column(
            "color",
            sa.String(length=7),
            nullable=False,
            server_default="#FFFFFF",
        ),
        sa.Column(
            "priority",
            sa.String(length=10),
            nullable=False,
            server_default="1",
        ),
        sa.Column("location", sa.String(length=500), nullable=True),
        sa.Column("sort_index", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "plan_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("name", sa.String(length=20), nullable=False, unique=True),
    )

    op.create_table(
        "plan_template_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "tag_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_tags.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("template_id", "tag_id", name="uq_plan_template_tag"),
    )

    op.create_table(
        "plan_subscriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "subscriber_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "timezone",
            sa.String(length=100),
            nullable=False,
            server_default="Asia/Shanghai",
        ),
        sa.UniqueConstraint(
            "template_id",
            "subscriber_user_id",
            "project_id",
            name="uq_plan_subscription_template_user_project",
        ),
    )

    op.create_table(
        "plan_subscription_segments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "subscription_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_plan_subscription_one_open_segment",
        "plan_subscription_segments",
        ["subscription_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
    )

    op.create_table(
        "plan_apply_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column(
            "actor_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            UUID(as_uuid=True),
            sa.ForeignKey("workspaces.id"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            UUID(as_uuid=True),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column(
            "subscription_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_subscriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "segment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_subscription_segments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_kind", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "skipped_slots",
            JSONB,
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_plan_apply_one_shot_applied",
        "plan_apply_runs",
        ["actor_user_id", "template_id", "project_id", "period_start"],
        unique=True,
        postgresql_where=sa.text("source = 'one_shot' AND status = 'applied'"),
    )
    op.create_index(
        "uq_plan_apply_sub_applied",
        "plan_apply_runs",
        ["subscription_id", "period_start"],
        unique=True,
        postgresql_where=sa.text("subscription_id IS NOT NULL AND status = 'applied'"),
    )
    op.create_index(
        "uq_plan_apply_sub_pending",
        "plan_apply_runs",
        ["subscription_id", "period_start"],
        unique=True,
        postgresql_where=sa.text("subscription_id IS NOT NULL AND status = 'pending'"),
    )

    op.create_table(
        "plan_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("body", sa.String(length=10000), nullable=False),
        sa.Column(
            "parent_comment_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_comments.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "plan_notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "subscription_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_subscriptions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "apply_run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_apply_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "meta",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    op.add_column(
        "items",
        sa.Column(
            "source_plan_template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_templates.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "items",
        sa.Column(
            "source_plan_slot_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_slots.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "items",
        sa.Column(
            "source_plan_apply_run_id",
            UUID(as_uuid=True),
            sa.ForeignKey("plan_apply_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("items", "source_plan_apply_run_id")
    op.drop_column("items", "source_plan_slot_id")
    op.drop_column("items", "source_plan_template_id")
    op.drop_table("plan_notifications")
    op.drop_table("plan_comments")
    op.drop_index("uq_plan_apply_sub_pending", table_name="plan_apply_runs")
    op.drop_index("uq_plan_apply_sub_applied", table_name="plan_apply_runs")
    op.drop_index("uq_plan_apply_one_shot_applied", table_name="plan_apply_runs")
    op.drop_table("plan_apply_runs")
    op.drop_index(
        "uq_plan_subscription_one_open_segment",
        table_name="plan_subscription_segments",
    )
    op.drop_table("plan_subscription_segments")
    op.drop_table("plan_subscriptions")
    op.drop_table("plan_template_tags")
    op.drop_table("plan_tags")
    op.drop_table("plan_slots")
    op.drop_table("plan_templates")
