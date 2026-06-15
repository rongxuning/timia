"""Normalize workspace/project roles to owner|member only.

Revision ID: 0008_unify_owner_member_roles
Revises: 0007_comment_threading
Create Date: 2026-05-13

"""

import sqlalchemy as sa
from alembic import op

revision = "0008_unify_owner_member_roles"
down_revision = "0007_comment_threading"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("UPDATE workspace_members SET role = 'owner' WHERE role = 'admin'"))
    op.execute(sa.text("UPDATE workspace_members SET role = 'member' WHERE role = 'guest'"))
    op.execute(sa.text("UPDATE project_members SET role = 'owner' WHERE role = 'admin'"))


def downgrade():
    op.execute(sa.text("UPDATE project_members SET role = 'admin' WHERE role = 'owner'"))
    op.execute(sa.text("UPDATE workspace_members SET role = 'guest' WHERE role = 'member' AND 1=0"))
    # Cannot safely restore admin vs owner split; leave as owner
