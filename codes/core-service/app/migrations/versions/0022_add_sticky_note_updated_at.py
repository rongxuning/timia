"""add updated_at to sticky_note_attachments and sticky_note_ai_parses

The model inherits TimestampMixin which provides ``updated_at``, but the
original 0010 migration only added it to ``sticky_notes``. This left
``db.refresh(sticky_note)`` failing on the lazy ``parses`` relationship
because the SELECT referenced a non-existent column.

Revision ID: 0022_sticky_updated_at
Revises: 0021_merge_0011_0020
Create Date: 2026-08-05

"""

import sqlalchemy as sa
from alembic import op


revision = "0022_sticky_updated_at"
down_revision = "0021_merge_0011_0020"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "sticky_note_attachments",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.add_column(
        "sticky_note_ai_parses",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade():
    op.drop_column("sticky_note_ai_parses", "updated_at")
    op.drop_column("sticky_note_attachments", "updated_at")
