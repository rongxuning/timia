"""comment threading and completion status

Revision ID: 0007_comment_threading
Revises: 0006_merge_0005_heads
Create Date: 2026-05-10

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_comment_threading"
down_revision = "0006_merge_0005_heads"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "comments",
        sa.Column("parent_comment_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_comments_parent_comment_id",
        "comments",
        "comments",
        ["parent_comment_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column(
        "comments",
        sa.Column(
            "completion_status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
    )


def downgrade():
    op.drop_constraint("fk_comments_parent_comment_id", "comments", type_="foreignkey")
    op.drop_column("comments", "completion_status")
    op.drop_column("comments", "parent_comment_id")
