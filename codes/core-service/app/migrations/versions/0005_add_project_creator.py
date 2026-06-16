"""add project creator

Revision ID: 0005_add_project_creator
Revises: 0004_add_project_members
Create Date: 2026-05-08

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_add_project_creator"
down_revision = "0004_add_project_members"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "projects",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )


def downgrade():
    op.drop_column("projects", "created_by_user_id")

