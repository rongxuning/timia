"""add workspace description

Revision ID: 0003_add_workspace_description
Revises: 0002_add_item_schedule_fields
Create Date: 2026-04-30

"""

from alembic import op
import sqlalchemy as sa


revision = "0003_add_workspace_description"
down_revision = "0002_add_item_schedule_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workspaces", sa.Column("description", sa.String(length=2000), nullable=True))


def downgrade():
    op.drop_column("workspaces", "description")

