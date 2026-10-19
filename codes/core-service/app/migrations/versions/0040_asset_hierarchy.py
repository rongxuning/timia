"""Asset hierarchy: institution, account, currency balance, unique codes.

Revision ID: 0040_asset_hierarchy
Revises: 0039_asset_multicurrency
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op

revision = "0040_asset_hierarchy"
down_revision = "0039_asset_multicurrency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset_code_counters",
        sa.Column("owner_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("next_value", sa.Integer(), nullable=False),
    )
    op.create_table(
        "asset_codes",
        sa.Column("owner_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("code", sa.String(length=16), primary_key=True),
    )
    op.create_table(
        "asset_parties",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("institution_kind", sa.String(length=16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "institution_kind IN ('bank', 'broker', 'payment', 'agency', 'other')",
            name="ck_asset_parties_kind",
        ),
    )
    op.create_index("ix_asset_parties_owner", "asset_parties", ["owner_user_id"])
    op.create_table(
        "asset_accounts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "party_id",
            sa.Uuid(),
            sa.ForeignKey("asset_parties.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("account_kind", sa.String(length=16), nullable=False),
        sa.Column("card_number", sa.String(length=30), nullable=True),
        sa.Column("asset_account_no", sa.String(length=40), nullable=True),
        sa.Column("account_number", sa.String(length=40), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "account_kind IN ("
            "'debit_card', 'credit_card', 'securities', 'wallet', "
            "'housing_fund', 'medical', 'gold', 'fx', 'other'"
            ")",
            name="ck_asset_accounts_kind",
        ),
    )
    op.create_index("ix_asset_accounts_owner", "asset_accounts", ["owner_user_id"])
    op.create_index("ix_asset_accounts_party", "asset_accounts", ["party_id"])
    op.create_index(
        "uq_asset_accounts_card",
        "asset_accounts",
        ["owner_user_id", "card_number"],
        unique=True,
        postgresql_where=sa.text("card_number IS NOT NULL AND archived_at IS NULL"),
    )
    op.create_index(
        "uq_asset_accounts_asset_no",
        "asset_accounts",
        ["owner_user_id", "asset_account_no"],
        unique=True,
        postgresql_where=sa.text("asset_account_no IS NOT NULL AND archived_at IS NULL"),
    )

    op.add_column("asset_holdings", sa.Column("account_id", sa.Uuid(), nullable=True))
    op.add_column("asset_holdings", sa.Column("code", sa.String(length=16), nullable=True))
    _backfill()
    op.alter_column("asset_holdings", "account_id", nullable=False)
    op.alter_column("asset_holdings", "code", nullable=False)
    op.create_foreign_key(
        "fk_asset_holdings_account",
        "asset_holdings",
        "asset_accounts",
        ["account_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_asset_holdings_account", "asset_holdings", ["account_id"])
    op.create_index(
        "uq_asset_holdings_balance",
        "asset_holdings",
        ["account_id", "category", "currency"],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL"),
    )


def _backfill() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            """
            SELECT id, owner_user_id, name, category, institution, created_at, updated_at
            FROM asset_holdings
            ORDER BY created_at, id
            """
        )
    ).mappings()
    counters: dict[str, int] = {}
    now_sql = sa.text("SELECT now()")
    now = conn.execute(now_sql).scalar()
    for row in rows:
        owner = str(row["owner_user_id"])
        party_code = _next(counters, owner)
        account_code = _next(counters, owner)
        balance_code = _next(counters, owner)
        party_id = uuid.uuid4()
        account_id = uuid.uuid4()
        party_name = (row["institution"] or row["name"] or "未命名机构")[:80]
        conn.execute(
            sa.text(
                """
                INSERT INTO asset_parties (
                    id, owner_user_id, code, name, institution_kind, version,
                    created_at, updated_at
                ) VALUES (
                    :id, :owner, :code, :name, :kind, 1, :created_at, :updated_at
                )
                """
            ),
            {
                "id": party_id,
                "owner": row["owner_user_id"],
                "code": party_code,
                "name": party_name,
                "kind": _party_kind(row["category"]),
                "created_at": row["created_at"] or now,
                "updated_at": row["updated_at"] or now,
            },
        )
        conn.execute(
            sa.text(
                """
                INSERT INTO asset_accounts (
                    id, owner_user_id, party_id, code, name, account_kind, version,
                    created_at, updated_at
                ) VALUES (
                    :id, :owner, :party_id, :code, :name, :kind, 1, :created_at, :updated_at
                )
                """
            ),
            {
                "id": account_id,
                "owner": row["owner_user_id"],
                "party_id": party_id,
                "code": account_code,
                "name": (row["name"] or "账户")[:80],
                "kind": _account_kind(row["category"]),
                "created_at": row["created_at"] or now,
                "updated_at": row["updated_at"] or now,
            },
        )
        conn.execute(
            sa.text(
                "UPDATE asset_holdings SET account_id = :account_id, code = :code WHERE id = :id"
            ),
            {"account_id": account_id, "code": balance_code, "id": row["id"]},
        )
        for code in (party_code, account_code, balance_code):
            conn.execute(
                sa.text(
                    "INSERT INTO asset_codes (owner_user_id, code) VALUES (:owner, :code)"
                ),
                {"owner": row["owner_user_id"], "code": code},
            )
    for owner, nxt in counters.items():
        conn.execute(
            sa.text(
                """
                INSERT INTO asset_code_counters (owner_user_id, next_value)
                VALUES (:owner, :next_value)
                """
            ),
            {"owner": owner, "next_value": nxt + 1},
        )


def _next(counters: dict[str, int], owner: str) -> str:
    counters[owner] = counters.get(owner, 0) + 1
    return f"A{counters[owner]:06d}"


def _party_kind(category: str) -> str:
    if category in {"a_share", "hk_share"}:
        return "broker"
    if category == "wallet":
        return "payment"
    if category in {"housing_fund", "medical"}:
        return "agency"
    if category in {"bank_deposit", "credit_card", "fx"}:
        return "bank"
    return "other"


def _account_kind(category: str) -> str:
    return {
        "bank_deposit": "debit_card",
        "credit_card": "credit_card",
        "a_share": "securities",
        "hk_share": "securities",
        "wallet": "wallet",
        "housing_fund": "housing_fund",
        "medical": "medical",
        "gold": "gold",
        "fx": "fx",
    }.get(category, "other")


def downgrade() -> None:
    op.drop_index("uq_asset_holdings_balance", table_name="asset_holdings")
    op.drop_index("ix_asset_holdings_account", table_name="asset_holdings")
    op.drop_constraint("fk_asset_holdings_account", "asset_holdings", type_="foreignkey")
    op.drop_column("asset_holdings", "code")
    op.drop_column("asset_holdings", "account_id")
    op.drop_index("uq_asset_accounts_asset_no", table_name="asset_accounts")
    op.drop_index("uq_asset_accounts_card", table_name="asset_accounts")
    op.drop_index("ix_asset_accounts_party", table_name="asset_accounts")
    op.drop_index("ix_asset_accounts_owner", table_name="asset_accounts")
    op.drop_table("asset_accounts")
    op.drop_index("ix_asset_parties_owner", table_name="asset_parties")
    op.drop_table("asset_parties")
    op.drop_table("asset_codes")
    op.drop_table("asset_code_counters")
