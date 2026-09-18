"""Item location coordinates (WGS-84).

Revision ID: 0035_item_location_coordinates
Revises: 0034_merge_0033_heads
Create Date: 2026-09-18

"""

import sqlalchemy as sa
from alembic import op

revision = "0035_item_location_coordinates"
down_revision = "0034_merge_0033_heads"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("items", sa.Column("location_lat", sa.Float(), nullable=True))
    op.add_column("items", sa.Column("location_lng", sa.Float(), nullable=True))
    op.create_index(
        "ix_items_location_coords",
        "items",
        ["location_lat", "location_lng"],
        postgresql_where=sa.text("location_lat IS NOT NULL AND location_lng IS NOT NULL"),
    )


def downgrade():
    op.drop_index("ix_items_location_coords", table_name="items")
    op.drop_column("items", "location_lng")
    op.drop_column("items", "location_lat")
