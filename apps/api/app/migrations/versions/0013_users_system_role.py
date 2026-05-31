"""users.system_role

Revision ID: 0013_users_system_role
Revises: 0012_users_display_name_unique
Create Date: 2026-05-31

"""

import sqlalchemy as sa
from alembic import op

revision = "0013_users_system_role"
down_revision = "0012_users_display_name_unique"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "users",
        sa.Column("system_role", sa.String(length=20), nullable=False, server_default="user"),
    )
    op.execute(sa.text("UPDATE users SET system_role = 'admin' WHERE email = 'admin@gmail.com'"))
    op.alter_column("users", "system_role", server_default=None)


def downgrade():
    op.drop_column("users", "system_role")
