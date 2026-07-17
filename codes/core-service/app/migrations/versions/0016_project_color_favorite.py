"""project color and favorite

Revision ID: 0016_project_color_favorite
Revises: 0015_workspace_color
Create Date: 2026-07-17

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0016_project_color_favorite"
down_revision = "0015_workspace_color"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "projects",
        sa.Column("color", sa.String(length=7), nullable=False, server_default="#FFFFFF"),
    )
    op.alter_column("projects", "color", server_default=None)
    op.create_table(
        "project_favorites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_favorite"),
    )
    op.create_index("ix_project_favorites_project_id", "project_favorites", ["project_id"])
    op.create_index("ix_project_favorites_user_id", "project_favorites", ["user_id"])


def downgrade():
    op.drop_index("ix_project_favorites_user_id", table_name="project_favorites")
    op.drop_index("ix_project_favorites_project_id", table_name="project_favorites")
    op.drop_table("project_favorites")
    op.drop_column("projects", "color")
