"""Read model for the personal assets page."""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.asset import AssetHoldingOut
from app.schemas.views.assets import (
    AllocationSliceOut,
    AssetsSummaryOut,
    MyAssetsViewOut,
    NetWorthPointOut,
)
from app.services.asset_api import list_active_holdings, list_valuations, profile_out
from app.services.assets_math import (
    BookHolding,
    BookValuation,
    category_sort_key,
    needs_review,
    net_worth_series,
    summarize,
)


def build_my_assets(db: Session, user: User, *, today: date | None = None) -> MyAssetsViewOut:
    today = today or datetime.now(timezone.utc).date()
    rows = list_active_holdings(db, user.id)
    rows.sort(
        key=lambda row: (
            *category_sort_key(row.kind, row.category),
            row.name.casefold(),
            str(row.id),
        )
    )
    profile = profile_out(db, user)
    books = [
        BookHolding(
            holding_id=str(row.id),
            kind=row.kind,
            category=row.category,
            amount_minor=row.amount_minor,
            include_in_net_worth=row.include_in_net_worth,
            as_of=row.as_of,
            archived=False,
        )
        for row in rows
    ]
    summary, allocation = summarize(
        books,
        monthly_essential_minor=profile.monthly_essential_minor,
        today=today,
    )
    valuations = [
        BookValuation(
            holding_id=str(point.holding_id),
            amount_minor=point.amount_minor,
            as_of=point.as_of,
            recorded_at=point.created_at,
        )
        for point in list_valuations(db, [row.id for row in rows])
    ]
    series = net_worth_series(books, valuations)
    return MyAssetsViewOut(
        profile=profile,
        summary=AssetsSummaryOut(
            total_assets_minor=summary.total_assets_minor,
            total_liabilities_minor=summary.total_liabilities_minor,
            net_worth_minor=summary.net_worth_minor,
            liquid_net_worth_minor=summary.liquid_net_worth_minor,
            cash_minor=summary.cash_minor,
            investment_minor=summary.investment_minor,
            high_interest_debt_minor=summary.high_interest_debt_minor,
            debt_ratio=summary.debt_ratio,
            emergency_months=summary.emergency_months,
            emergency_band=summary.emergency_band,
            debt_band=summary.debt_band,
            needs_review_count=summary.needs_review_count,
            focus=summary.focus,
            holding_count=summary.holding_count,
            latest_as_of=summary.latest_as_of,
        ),
        holdings=[
            AssetHoldingOut(
                id=str(row.id),
                name=row.name,
                kind=row.kind,  # type: ignore[arg-type]
                category=row.category,
                amount_minor=row.amount_minor,
                institution=row.institution,
                note=row.note,
                as_of=row.as_of,
                include_in_net_worth=row.include_in_net_worth,
                needs_review=needs_review(row.as_of, today),
                version=row.version,
            )
            for row in rows
        ],
        allocation=[
            AllocationSliceOut(
                kind=item.kind,  # type: ignore[arg-type]
                category=item.category,
                amount_minor=item.amount_minor,
                share=item.share,
            )
            for item in allocation
        ],
        net_worth_series=[
            NetWorthPointOut(as_of=point.as_of, net_worth_minor=point.net_worth_minor) for point in series
        ],
    )
