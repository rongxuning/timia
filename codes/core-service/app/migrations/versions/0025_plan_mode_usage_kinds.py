"""Rename plan usage kinds to plan_mode and subscription_mode."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0025_plan_mode_usage_kinds"
down_revision = "0024_plan_favorites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE plan_templates SET usage_kind = 'plan_mode' WHERE usage_kind = 'one_shot'"
    )
    op.execute(
        "UPDATE plan_templates SET usage_kind = 'subscription_mode' "
        "WHERE usage_kind = 'subscription'"
    )
    op.execute(
        "UPDATE plan_apply_runs SET source = 'plan_mode' WHERE source = 'one_shot'"
    )
    op.execute(
        "UPDATE plan_apply_runs SET source = 'subscription_mode' "
        "WHERE source = 'subscription'"
    )

    op.drop_index("uq_plan_apply_one_shot_applied", table_name="plan_apply_runs")
    op.create_index(
        "uq_plan_apply_plan_mode_applied",
        "plan_apply_runs",
        ["actor_user_id", "template_id", "project_id", "period_start"],
        unique=True,
        postgresql_where=sa.text("source = 'plan_mode' AND status = 'applied'"),
    )


def downgrade() -> None:
    op.drop_index("uq_plan_apply_plan_mode_applied", table_name="plan_apply_runs")
    op.create_index(
        "uq_plan_apply_one_shot_applied",
        "plan_apply_runs",
        ["actor_user_id", "template_id", "project_id", "period_start"],
        unique=True,
        postgresql_where=sa.text("source = 'one_shot' AND status = 'applied'"),
    )

    op.execute(
        "UPDATE plan_apply_runs SET source = 'one_shot' WHERE source = 'plan_mode'"
    )
    op.execute(
        "UPDATE plan_apply_runs SET source = 'subscription' "
        "WHERE source = 'subscription_mode'"
    )
    op.execute(
        "UPDATE plan_templates SET usage_kind = 'one_shot' WHERE usage_kind = 'plan_mode'"
    )
    op.execute(
        "UPDATE plan_templates SET usage_kind = 'subscription' "
        "WHERE usage_kind = 'subscription_mode'"
    )
