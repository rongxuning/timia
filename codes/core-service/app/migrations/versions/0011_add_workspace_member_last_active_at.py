"""add workspace_member.last_active_at for sticky-note fallback ranking

Revision ID: 0011_add_wm_last_active
Revises: 0010_add_sticky_notes
Create Date: 2026-08-05

"""

import sqlalchemy as sa
from alembic import op


revision = "0011_add_wm_last_active"
down_revision = "0010_add_sticky_notes"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workspace_members",
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_workspace_members_user_last_active",
        "workspace_members",
        ["user_id", sa.text("last_active_at DESC NULLS LAST")],
        postgresql_where=sa.text("status = 'active'"),
    )


def downgrade():
    op.drop_index("idx_workspace_members_user_last_active", table_name="workspace_members")
    op.drop_column("workspace_members", "last_active_at")
