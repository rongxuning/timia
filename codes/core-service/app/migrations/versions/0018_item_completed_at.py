"""item completion time

Revision ID: 0018_item_completed_at
Revises: 0017_item_color
Create Date: 2026-07-17

"""

import sqlalchemy as sa
from alembic import op

revision = "0018_item_completed_at"
down_revision = "0017_item_color"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("items", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE items SET completed_at = updated_at WHERE status = 'done'")


def downgrade():
    op.drop_column("items", "completed_at")
