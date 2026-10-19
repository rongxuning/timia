"""Multi-currency balances, adjustment reasons, and expense groups.

Revision ID: 0039_asset_multicurrency
Revises: 0038_asset_ledger
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0039_asset_multicurrency"
down_revision = "0038_asset_ledger"
branch_labels = None
depends_on = None

_CURRENCIES = "'CNY', 'HKD', 'JPY', 'KRW', 'USD', 'EUR', 'GBP'"
_HOLDING_CATEGORIES = (
    "'a_share', 'hk_share', 'bank_deposit', 'wallet', 'housing_fund', 'medical', "
    "'fx', 'gold', 'other_asset', 'credit_card', 'other_liability'"
)


def upgrade() -> None:
    op.drop_constraint("ck_asset_profiles_currency", "asset_profiles", type_="check")
    op.drop_constraint("ck_asset_profiles_essential", "asset_profiles", type_="check")
    op.alter_column("asset_profiles", "currency", new_column_name="display_currency")
    op.drop_column("asset_profiles", "monthly_essential_minor")
    op.create_check_constraint(
        "ck_asset_profiles_display_currency",
        "asset_profiles",
        f"display_currency IN ({_CURRENCIES})",
    )

    op.add_column(
        "asset_holdings",
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CNY"),
    )
    op.add_column(
        "asset_holdings",
        sa.Column("adjusted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute(
        "UPDATE asset_holdings SET adjusted_at = (as_of::timestamp AT TIME ZONE 'UTC')"
    )
    op.alter_column("asset_holdings", "adjusted_at", nullable=False)
    op.drop_constraint("ck_asset_holdings_category", "asset_holdings", type_="check")
    op.execute(
        """
        UPDATE asset_holdings SET category = CASE category
            WHEN 'cash' THEN 'bank_deposit'
            WHEN 'investment' THEN 'a_share'
            WHEN 'property' THEN 'other_asset'
            WHEN 'durable' THEN 'other_asset'
            WHEN 'receivable' THEN 'other_asset'
            WHEN 'credit' THEN 'credit_card'
            WHEN 'installment' THEN 'other_liability'
            WHEN 'mortgage' THEN 'other_liability'
            WHEN 'payable' THEN 'other_liability'
            ELSE category
        END
        """
    )
    op.create_check_constraint(
        "ck_asset_holdings_category",
        "asset_holdings",
        f"category IN ({_HOLDING_CATEGORIES})",
    )
    op.create_check_constraint(
        "ck_asset_holdings_currency",
        "asset_holdings",
        f"currency IN ({_CURRENCIES})",
    )
    op.drop_column("asset_holdings", "as_of")

    op.create_table(
        "asset_adjustments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "holding_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_holdings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("delta_minor", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_minor >= 0", name="ck_asset_adjustments_amount"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_adjustments_reason"),
    )
    op.create_index(
        "ix_asset_adjustments_holding_time",
        "asset_adjustments",
        ["holding_id", "recorded_at"],
    )
    op.execute(
        """
        INSERT INTO asset_adjustments (
            id, holding_id, owner_user_id, amount_minor, delta_minor, reason,
            recorded_at, created_at, updated_at
        )
        SELECT
            v.id,
            v.holding_id,
            v.owner_user_id,
            v.amount_minor,
            v.amount_minor - COALESCE((
                SELECT prev.amount_minor
                FROM asset_valuations AS prev
                WHERE prev.holding_id = v.holding_id
                  AND (prev.as_of, prev.created_at, prev.id) < (v.as_of, v.created_at, v.id)
                ORDER BY prev.as_of DESC, prev.created_at DESC, prev.id DESC
                LIMIT 1
            ), 0),
            '初始盘点',
            (v.as_of::timestamp AT TIME ZONE 'UTC'),
            v.created_at,
            v.updated_at
        FROM asset_valuations AS v
        """
    )
    op.drop_index("ix_asset_valuations_holding_as_of", table_name="asset_valuations")
    op.drop_table("asset_valuations")

    op.create_table(
        "asset_fx_rates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("cny_per_unit", sa.Numeric(20, 8), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_user_id", "currency", name="uq_asset_fx_rates_owner_currency"),
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_fx_rates_currency"),
        sa.CheckConstraint("currency <> 'CNY'", name="ck_asset_fx_rates_not_cny"),
        sa.CheckConstraint("cny_per_unit > 0", name="ck_asset_fx_rates_positive"),
    )
    op.create_index("ix_asset_fx_rates_owner", "asset_fx_rates", ["owner_user_id"])

    op.create_table(
        "asset_expense_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("group_kind", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("adjusted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "group_kind IN ('fixed', 'daily', 'emergency', 'other')",
            name="ck_asset_expense_items_group",
        ),
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_expense_items_currency"),
        sa.CheckConstraint("amount_minor >= 0", name="ck_asset_expense_items_amount"),
    )
    op.create_index("ix_asset_expense_items_owner", "asset_expense_items", ["owner_user_id"])

    op.create_table(
        "asset_expense_adjustments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "expense_item_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_expense_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("delta_minor", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_minor >= 0", name="ck_asset_expense_adjustments_amount"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_expense_adjustments_reason"),
    )
    op.create_index(
        "ix_asset_expense_adjustments_item_time",
        "asset_expense_adjustments",
        ["expense_item_id", "recorded_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_asset_expense_adjustments_item_time", table_name="asset_expense_adjustments")
    op.drop_table("asset_expense_adjustments")
    op.drop_index("ix_asset_expense_items_owner", table_name="asset_expense_items")
    op.drop_table("asset_expense_items")
    op.drop_index("ix_asset_fx_rates_owner", table_name="asset_fx_rates")
    op.drop_table("asset_fx_rates")

    op.create_table(
        "asset_valuations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "holding_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_holdings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_minor >= 0", name="ck_asset_valuations_amount"),
    )
    op.create_index(
        "ix_asset_valuations_holding_as_of",
        "asset_valuations",
        ["holding_id", "as_of"],
    )
    op.execute(
        """
        INSERT INTO asset_valuations (
            id, holding_id, owner_user_id, amount_minor, as_of, created_at, updated_at
        )
        SELECT
            id, holding_id, owner_user_id, amount_minor,
            (recorded_at AT TIME ZONE 'UTC')::date,
            created_at, updated_at
        FROM asset_adjustments
        """
    )
    op.drop_index("ix_asset_adjustments_holding_time", table_name="asset_adjustments")
    op.drop_table("asset_adjustments")

    op.add_column("asset_holdings", sa.Column("as_of", sa.Date(), nullable=True))
    op.execute("UPDATE asset_holdings SET as_of = (adjusted_at AT TIME ZONE 'UTC')::date")
    op.alter_column("asset_holdings", "as_of", nullable=False)
    op.drop_constraint("ck_asset_holdings_currency", "asset_holdings", type_="check")
    op.drop_constraint("ck_asset_holdings_category", "asset_holdings", type_="check")
    op.execute(
        """
        UPDATE asset_holdings SET category = CASE category
            WHEN 'bank_deposit' THEN 'cash'
            WHEN 'wallet' THEN 'cash'
            WHEN 'a_share' THEN 'investment'
            WHEN 'hk_share' THEN 'investment'
            WHEN 'fx' THEN 'investment'
            WHEN 'gold' THEN 'investment'
            WHEN 'housing_fund' THEN 'other_asset'
            WHEN 'medical' THEN 'other_asset'
            WHEN 'credit_card' THEN 'credit'
            ELSE 'other_asset'
        END
        WHERE category NOT IN (
            'cash', 'investment', 'property', 'durable', 'receivable', 'other_asset',
            'credit', 'installment', 'mortgage', 'payable', 'other_liability'
        )
        """
    )
    op.create_check_constraint(
        "ck_asset_holdings_category",
        "asset_holdings",
        "category IN ("
        "'cash', 'investment', 'property', 'durable', 'receivable', 'other_asset', "
        "'credit', 'installment', 'mortgage', 'payable', 'other_liability'"
        ")",
    )
    op.drop_column("asset_holdings", "adjusted_at")
    op.drop_column("asset_holdings", "currency")

    op.add_column(
        "asset_profiles",
        sa.Column("monthly_essential_minor", sa.BigInteger(), nullable=True),
    )
    op.drop_constraint("ck_asset_profiles_display_currency", "asset_profiles", type_="check")
    op.alter_column("asset_profiles", "display_currency", new_column_name="currency")
    op.execute(
        """
        UPDATE asset_profiles SET currency = 'CNY'
        WHERE currency NOT IN ('CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY')
        """
    )
    op.create_check_constraint(
        "ck_asset_profiles_currency",
        "asset_profiles",
        "currency IN ('CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY')",
    )
    op.create_check_constraint(
        "ck_asset_profiles_essential",
        "asset_profiles",
        "monthly_essential_minor IS NULL OR monthly_essential_minor > 0",
    )
