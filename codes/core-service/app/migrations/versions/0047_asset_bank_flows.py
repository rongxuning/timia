"""Income and expense records on bank accounts.

Revision ID: 0047_asset_bank_flows
Revises: 0046_asset_stock_frozen
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0047_asset_bank_flows"
down_revision = "0046_asset_stock_frozen"
branch_labels = None
depends_on = None

_CURRENCIES = "'CNY', 'HKD', 'JPY', 'KRW', 'USD', 'EUR', 'GBP'"


def upgrade() -> None:
    op.create_table(
        "asset_bank_flows",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("direction", sa.String(length=8), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("direction IN ('income', 'expense')", name="ck_asset_bank_flows_direction"),
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_bank_flows_currency"),
        sa.CheckConstraint("amount_minor > 0", name="ck_asset_bank_flows_amount"),
    )
    op.create_index("ix_asset_bank_flows_account_time", "asset_bank_flows", ["account_id", "recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_asset_bank_flows_account_time", table_name="asset_bank_flows")
    op.drop_table("asset_bank_flows")
