"""Personal asset ledger — owner scoped, no workspace.

A holding is one line on a household balance sheet (a bank balance, a fund,
a home, a card balance). Valuations are the amounts recorded at each stocktake.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin

_CATEGORIES = (
    "cash",
    "investment",
    "property",
    "durable",
    "receivable",
    "other_asset",
    "credit",
    "installment",
    "mortgage",
    "payable",
    "other_liability",
)


class AssetProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """One balance-sheet setup per user. All holdings share its currency."""

    __tablename__ = "asset_profiles"
    __table_args__ = (
        CheckConstraint(
            "currency IN ('CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY')",
            name="ck_asset_profiles_currency",
        ),
        CheckConstraint(
            "monthly_essential_minor IS NULL OR monthly_essential_minor > 0",
            name="ck_asset_profiles_essential",
        ),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="CNY")
    monthly_essential_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class AssetHolding(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "asset_holdings"
    __table_args__ = (
        CheckConstraint("kind IN ('asset', 'liability')", name="ck_asset_holdings_kind"),
        CheckConstraint(
            "category IN (" + ", ".join(f"'{item}'" for item in _CATEGORIES) + ")",
            name="ck_asset_holdings_category",
        ),
        CheckConstraint("amount_minor >= 0", name="ck_asset_holdings_amount"),
        Index("ix_asset_holdings_owner", "owner_user_id"),
    )

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    amount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    institution: Mapped[str | None] = mapped_column(String(80), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
    include_in_net_worth: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AssetValuation(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Append-only amount recorded for a holding on a stocktake date."""

    __tablename__ = "asset_valuations"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="ck_asset_valuations_amount"),
        Index("ix_asset_valuations_holding_as_of", "holding_id", "as_of"),
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
    as_of: Mapped[date] = mapped_column(Date, nullable=False)
