"""Ensure workspace creator membership role is owner.

Revision ID: 0009_ws_creator_owner
Revises: 0008_unify_owner_member_roles
Create Date: 2026-05-13

"""

import sqlalchemy as sa
from alembic import op

revision = "0009_ws_creator_owner"
down_revision = "0008_unify_owner_member_roles"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        sa.text(
            """
            UPDATE workspace_members AS wm
            SET role = 'owner'
            FROM workspaces AS w
            WHERE wm.workspace_id = w.id
              AND wm.user_id = w.created_by_user_id
              AND wm.role <> 'owner'
            """
        )
    )


def downgrade():
    pass
