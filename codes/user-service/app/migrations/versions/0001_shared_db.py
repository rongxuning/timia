"""Record shared-database ownership. No domain DDL.

Revision ID: 0001_shared_db
Revises:
Create Date: 2026-10-28

user-service reads and writes users, auth_identities, and web_sessions.
Those tables are created by core-service Alembic. Do not split the database
in this phase, and do not autogenerate drops from this service.
"""

revision = "0001_shared_db"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
