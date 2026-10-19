"""Personal asset ledger — owner scoped, no workspace.

Holdings keep the currency they were counted in. Display currency and the
CNY exchange rates live on the profile side. Every balance change is an
adjustment with a reason and a time.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin

_HOLDING_CATEGORIES = (
    "a_share",
    "hk_share",
    "bank_deposit",
    "wallet",
    "housing_fund",
    "medical",
    "fx",
    "gold",
    "other_asset",
    "credit_card",
    "other_liability",
)
_CURRENCIES = ("CNY", "HKD", "JPY", "KRW", "USD", "EUR", "GBP")
_EXPENSE_GROUPS = ("fixed", "daily", "emergency", "other")


def _in_list(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{item}'" for item in values)
    return f"{column} IN ({quoted})"


class AssetProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Display settings for one person's book. Balances are not stored here."""

    __tablename__ = "asset_profiles"
    __table_args__ = (
        CheckConstraint(_in_list("display_currency", _CURRENCIES), name="ck_asset_profiles_display_currency"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    display_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class AssetFxRate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """How many CNY one unit of ``currency`` is worth. CNY itself is always 1."""

    __tablename__ = "asset_fx_rates"
    __table_args__ = (
        UniqueConstraint("owner_user_id", "currency", name="uq_asset_fx_rates_owner_currency"),
        CheckConstraint(_in_list("currency", _CURRENCIES), name="ck_asset_fx_rates_currency"),
        CheckConstraint("currency <> 'CNY'", name="ck_asset_fx_rates_not_cny"),
        CheckConstraint("cny_per_unit > 0", name="ck_asset_fx_rates_positive"),
        Index("ix_asset_fx_rates_owner", "owner_user_id"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    cny_per_unit: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)


class AssetCodeCounter(Base):
    """Per-user sequence for asset codes. Codes are unique across the whole book."""

    __tablename__ = "asset_code_counters"

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    next_value: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class AssetCode(Base):
    __tablename__ = "asset_codes"

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    code: Mapped[str] = mapped_column(String(16), primary_key=True)


class AssetParty(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """开户机构：银行、券商、支付机构。下面挂账户。"""

    __tablename__ = "asset_parties"
    __table_args__ = (
        CheckConstraint(
            "institution_kind IN ('bank', 'broker', 'payment', 'agency', 'other')",
            name="ck_asset_parties_kind",
        ),
        Index("ix_asset_parties_owner", "owner_user_id"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    institution_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AssetAccount(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """一张卡或一个资产账号，归属某个开户机构。币种余额挂在它下面。"""

    __tablename__ = "asset_accounts"
    __table_args__ = (
        CheckConstraint(
            "account_kind IN ("
            "'debit_card', 'credit_card', 'securities', 'wallet', "
            "'housing_fund', 'medical', 'gold', 'fx', 'other'"
            ")",
            name="ck_asset_accounts_kind",
        ),
        Index("ix_asset_accounts_owner", "owner_user_id"),
        Index("ix_asset_accounts_party", "party_id"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    party_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("asset_parties.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    account_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    card_number: Mapped[str | None] = mapped_column(String(30), nullable=True)
    asset_account_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    account_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AssetHolding(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "asset_holdings"
    __table_args__ = (
        CheckConstraint("kind IN ('asset', 'liability')", name="ck_asset_holdings_kind"),
        CheckConstraint(
            _in_list("category", _HOLDING_CATEGORIES),
            name="ck_asset_holdings_category",
        ),
        CheckConstraint(_in_list("currency", _CURRENCIES), name="ck_asset_holdings_currency"),
        CheckConstraint("amount_minor >= 0", name="ck_asset_holdings_amount"),
        Index("ix_asset_holdings_owner", "owner_user_id"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("asset_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    code: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    institution: Mapped[str | None] = mapped_column(String(80), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adjusted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    include_in_net_worth: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AssetAdjustment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One recorded balance for a holding, with why it changed."""

    __tablename__ = "asset_adjustments"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="ck_asset_adjustments_amount"),
        CheckConstraint("char_length(reason) > 0", name="ck_asset_adjustments_reason"),
        Index("ix_asset_adjustments_holding_time", "holding_id", "recorded_at"),
    )

    holding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("asset_holdings.id", ondelete="CASCADE"),
        nullable=False,
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    delta_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AssetExpenseItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "asset_expense_items"
    __table_args__ = (
        CheckConstraint(_in_list("group_kind", _EXPENSE_GROUPS), name="ck_asset_expense_items_group"),
        CheckConstraint(_in_list("currency", _CURRENCIES), name="ck_asset_expense_items_currency"),
        CheckConstraint("amount_minor >= 0", name="ck_asset_expense_items_amount"),
        Index("ix_asset_expense_items_owner", "owner_user_id"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    group_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    adjusted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AssetExpenseAdjustment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "asset_expense_adjustments"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="ck_asset_expense_adjustments_amount"),
        CheckConstraint("char_length(reason) > 0", name="ck_asset_expense_adjustments_reason"),
        Index("ix_asset_expense_adjustments_item_time", "expense_item_id", "recorded_at"),
    )

    expense_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("asset_expense_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    delta_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
