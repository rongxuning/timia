"""workspace color

Revision ID: 0015_workspace_color
Revises: 0014_workspace_member_favorite
Create Date: 2026-07-17

"""

import sqlalchemy as sa
from alembic import op

revision = "0015_workspace_color"
down_revision = "0014_workspace_member_favorite"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "workspaces",
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#FFFFFF"),
    )
    op.alter_column("workspaces", "color", server_default=None)


def downgrade():
    op.drop_column("workspaces", "color")
