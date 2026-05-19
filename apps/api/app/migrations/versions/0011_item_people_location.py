"""Item: creator, assignee, participants, location.

Revision ID: 0011_item_people_location
Revises: 0010_proj_creator_owner
Create Date: 2026-05-14

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011_item_people_location"
down_revision = "0010_proj_creator_owner"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "items",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "items",
        sa.Column("assignee_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "items",
        sa.Column(
            "participant_user_ids",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False,
            server_default=sa.text("'{}'::uuid[]"),
        ),
    )
    op.add_column("items", sa.Column("location", sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column("items", "location")
    op.drop_column("items", "participant_user_ids")
    op.drop_column("items", "assignee_user_id")
    op.drop_column("items", "created_by_user_id")
