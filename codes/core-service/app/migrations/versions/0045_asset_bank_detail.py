"""Bank account products: savings, investment, and credit cards.

Revision ID: 0045_asset_bank_detail
Revises: 0044_stock_negative_cost
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0045_asset_bank_detail"
down_revision = "0044_stock_negative_cost"
branch_labels = None
depends_on = None

_CURRENCIES = "'CNY', 'HKD', 'JPY', 'KRW', 'USD', 'EUR', 'GBP'"
_KINDS = "'savings', 'investment', 'credit'"
_COST = "cost_minor BETWEEN -9007199254740991 AND 9007199254740991"


def upgrade() -> None:
    op.create_table(
        "asset_bank_products",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("product_kind", sa.String(length=16), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("balance_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("value_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("cost_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("limit_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("statement_minor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("paid_off", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("marked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"product_kind IN ({_KINDS})", name="ck_asset_bank_products_kind"),
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_bank_products_currency"),
        sa.CheckConstraint("balance_minor >= 0", name="ck_asset_bank_products_balance"),
        sa.CheckConstraint("value_minor >= 0", name="ck_asset_bank_products_value"),
        sa.CheckConstraint(_COST, name="ck_asset_bank_products_cost"),
        sa.CheckConstraint("limit_minor >= 0", name="ck_asset_bank_products_limit"),
        sa.CheckConstraint("statement_minor >= 0", name="ck_asset_bank_products_statement"),
    )
    op.create_index("ix_asset_bank_products_account", "asset_bank_products", ["account_id"])

    op.create_table(
        "asset_bank_savings_txns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "product_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_bank_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("balance_minor", sa.BigInteger(), nullable=False),
        sa.Column("delta_minor", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("balance_minor >= 0", name="ck_asset_bank_savings_txns_balance"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_bank_savings_txns_reason"),
    )
    op.create_index(
        "ix_asset_bank_savings_txns_product_time",
        "asset_bank_savings_txns",
        ["product_id", "recorded_at"],
    )

    op.create_table(
        "asset_bank_investment_ops",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "product_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_bank_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("value_minor", sa.BigInteger(), nullable=False),
        sa.Column("cost_minor", sa.BigInteger(), nullable=False),
        sa.Column("cost_delta_minor", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("value_minor >= 0", name="ck_asset_bank_investment_ops_value"),
        sa.CheckConstraint(_COST, name="ck_asset_bank_investment_ops_cost"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_bank_investment_ops_reason"),
    )
    op.create_index(
        "ix_asset_bank_investment_ops_product_time",
        "asset_bank_investment_ops",
        ["product_id", "recorded_at"],
    )

    op.create_table(
        "asset_bank_credit_bills",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "product_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_bank_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year_month", sa.String(length=7), nullable=False),
        sa.Column("limit_minor", sa.BigInteger(), nullable=False),
        sa.Column("statement_minor", sa.BigInteger(), nullable=False),
        sa.Column("paid_off", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("statement_minor >= 0", name="ck_asset_bank_credit_bills_statement"),
        sa.CheckConstraint("limit_minor >= 0", name="ck_asset_bank_credit_bills_limit"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_bank_credit_bills_reason"),
        sa.CheckConstraint(
            "year_month ~ '^[0-9]{4}-[0-9]{2}$'",
            name="ck_asset_bank_credit_bills_year_month",
        ),
        sa.UniqueConstraint("product_id", "year_month", name="uq_asset_bank_credit_bills_month"),
    )
    op.create_index(
        "ix_asset_bank_credit_bills_product_month",
        "asset_bank_credit_bills",
        ["product_id", "year_month"],
    )


def downgrade() -> None:
    op.drop_index("ix_asset_bank_credit_bills_product_month", table_name="asset_bank_credit_bills")
    op.drop_table("asset_bank_credit_bills")
    op.drop_index("ix_asset_bank_investment_ops_product_time", table_name="asset_bank_investment_ops")
    op.drop_table("asset_bank_investment_ops")
    op.drop_index("ix_asset_bank_savings_txns_product_time", table_name="asset_bank_savings_txns")
    op.drop_table("asset_bank_savings_txns")
    op.drop_index("ix_asset_bank_products_account", table_name="asset_bank_products")
    op.drop_table("asset_bank_products")
