"""drop item due_at

Revision ID: 0005_drop_item_due_at
Revises: 0004_add_project_members
Create Date: 2026-05-08

"""

from alembic import op
import sqlalchemy as sa


revision = "0005_drop_item_due_at"
down_revision = "0004_add_project_members"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("items", "due_at")


def downgrade():
    op.add_column("items", sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))

