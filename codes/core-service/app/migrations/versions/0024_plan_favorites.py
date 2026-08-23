"""plan favorites

Revision ID: 0024_plan_favorites
Revises: 0023_plan_domain
Create Date: 2026-08-23

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0024_plan_favorites"
down_revision = "0023_plan_domain"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "plan_favorites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("plan_templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "template_id", name="uq_plan_favorite"),
    )
    op.create_index("ix_plan_favorites_user_id", "plan_favorites", ["user_id"])
    op.create_index("ix_plan_favorites_template_id", "plan_favorites", ["template_id"])


def downgrade():
    op.drop_index("ix_plan_favorites_template_id", table_name="plan_favorites")
    op.drop_index("ix_plan_favorites_user_id", table_name="plan_favorites")
    op.drop_table("plan_favorites")
