"""add item schedule fields

Revision ID: 0002_add_item_schedule_fields
Revises: 0001_init_schema
Create Date: 2026-04-27

"""

from alembic import op
import sqlalchemy as sa


revision = "0002_add_item_schedule_fields"
down_revision = "0001_init_schema"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("items", sa.Column("start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("items", sa.Column("end_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("items", sa.Column("details", sa.String(length=10000), nullable=True))


def downgrade():
    op.drop_column("items", "details")
    op.drop_column("items", "end_at")
    op.drop_column("items", "start_at")

