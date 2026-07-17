"""item color

Revision ID: 0017_item_color
Revises: 0016_project_color_favorite
Create Date: 2026-07-17

"""

import sqlalchemy as sa
from alembic import op

revision = "0017_item_color"
down_revision = "0016_project_color_favorite"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "items",
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#FFFFFF"),
    )
    op.alter_column("items", "color", server_default=None)


def downgrade():
    op.drop_column("items", "color")
