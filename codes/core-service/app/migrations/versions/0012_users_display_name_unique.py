"""users.display_name unique index

Revision ID: 0012_users_display_name_unique
Revises: 0011_item_people_location
Create Date: 2026-05-19

"""

from alembic import op

revision = "0012_users_display_name_unique"
down_revision = "0011_item_people_location"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_users_display_name", "users", ["display_name"], unique=True)


def downgrade():
    op.drop_index("ix_users_display_name", table_name="users")
