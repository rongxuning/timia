"""workspace member favorite

Revision ID: 0014_workspace_member_favorite
Revises: 0013_users_system_role
Create Date: 2026-07-17

"""

import sqlalchemy as sa
from alembic import op

revision = "0014_workspace_member_favorite"
down_revision = "0013_users_system_role"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workspace_members",
        sa.Column("is_favorite", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("workspace_members", "is_favorite", server_default=None)


def downgrade():
    op.drop_column("workspace_members", "is_favorite")
