"""Ensure project creator membership role is owner.

Revision ID: 0010_proj_creator_owner
Revises: 0009_ws_creator_owner
Create Date: 2026-05-13

"""

import sqlalchemy as sa
from alembic import op

revision = "0010_proj_creator_owner"
down_revision = "0009_ws_creator_owner"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        sa.text(
            """
            UPDATE project_members AS pm
            SET role = 'owner'
            FROM projects AS p
            WHERE pm.project_id = p.id
              AND pm.user_id = p.created_by_user_id
              AND p.created_by_user_id IS NOT NULL
              AND pm.status = 'active'
              AND pm.role <> 'owner'
            """
        )
    )


def downgrade():
    pass
