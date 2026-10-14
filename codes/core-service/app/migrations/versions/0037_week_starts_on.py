"""Account week start and weekly subscription anchors.

Revision ID: 0037_week_starts_on
Revises: 0036_llm_api_keys
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0037_week_starts_on"
down_revision = "0036_llm_api_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("week_starts_on", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_check_constraint(
        "ck_users_week_starts_on",
        "users",
        "week_starts_on IN (1, 6, 7)",
    )
    op.add_column("plan_templates", sa.Column("week_starts_on", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_plan_templates_week_starts_on",
        "plan_templates",
        "week_starts_on IS NULL OR week_starts_on IN (1, 6, 7)",
    )
    op.execute(
        "UPDATE plan_templates SET week_starts_on = 7 "
        "WHERE period_kind = 'week' AND usage_kind = 'subscription_mode'"
    )
    op.execute(
        "UPDATE plan_slots SET rel_day = 7 "
        "WHERE rel_day = 0 AND template_id IN ("
        "SELECT id FROM plan_templates WHERE period_kind = 'week')"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE plan_slots SET rel_day = 0 "
        "WHERE rel_day = 7 AND template_id IN ("
        "SELECT id FROM plan_templates WHERE period_kind = 'week')"
    )
    op.drop_constraint("ck_plan_templates_week_starts_on", "plan_templates", type_="check")
    op.drop_column("plan_templates", "week_starts_on")
    op.drop_constraint("ck_users_week_starts_on", "users", type_="check")
    op.drop_column("users", "week_starts_on")
