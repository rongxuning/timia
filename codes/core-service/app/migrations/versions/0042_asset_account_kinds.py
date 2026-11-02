"""Allow the five account types used by the assets page.

Revision ID: 0042_asset_account_kinds
Revises: 0041_provider_login
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0042_asset_account_kinds"
down_revision = "0041_provider_login"
branch_labels = None
depends_on = None

_KINDS = (
    "'debit_card', 'credit_card', 'securities', 'wallet', "
    "'housing_fund', 'medical', 'gold', 'fx', 'other', "
    "'savings', 'credit', 'stock', 'metal', 'forex'"
)
_PREVIOUS_KINDS = (
    "'debit_card', 'credit_card', 'securities', 'wallet', "
    "'housing_fund', 'medical', 'gold', 'fx', 'other'"
)


def upgrade() -> None:
    op.drop_constraint("ck_asset_accounts_kind", "asset_accounts", type_="check")
    op.create_check_constraint(
        "ck_asset_accounts_kind",
        "asset_accounts",
        f"account_kind IN ({_KINDS})",
    )
    op.create_index(
        "uq_asset_accounts_number",
        "asset_accounts",
        ["owner_user_id", "account_number"],
        unique=True,
        postgresql_where=sa.text("account_number IS NOT NULL AND archived_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_asset_accounts_number", table_name="asset_accounts")
    op.drop_constraint("ck_asset_accounts_kind", "asset_accounts", type_="check")
    op.create_check_constraint(
        "ck_asset_accounts_kind",
        "asset_accounts",
        f"account_kind IN ({_PREVIOUS_KINDS})",
    )
