"""Read model for the personal assets page."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.asset import AssetFxRateOut
from app.schemas.views.assets import (
    AssetExpenseViewOut,
    AssetHoldingViewOut,
    AssetsSummaryOut,
    ExpenseGroupOut,
    HoldingGroupOut,
    MyAssetsViewOut,
    NetWorthPointOut,
)
from app.services.asset_api import (
    latest_expense_reasons,
    latest_reasons,
    list_active_expenses,
    list_active_holdings,
    list_holding_adjustments,
    list_rates,
    profile_out,
)
from app.services.assets_math import (
    EXPENSE_GROUP_ORDER,
    BookAdjustment,
    BookLine,
    ExpenseLine,
    category_sort_key,
    convert_minor,
    coverage_months,
    needs_review,
    net_worth_series,
    summarize_expenses,
    summarize_holdings,
)


def build_my_assets(db: Session, user: User) -> MyAssetsViewOut:
    today = datetime.now(timezone.utc).date()
    profile = profile_out(db, user)
    display = profile.display_currency
    rate_rows = list_rates(db, user.id)
    rates = {row.currency: Decimal(row.cny_per_unit) for row in rate_rows}
    holdings = list_active_holdings(db, user.id)
    expenses = list_active_expenses(db, user.id)
    reasons = latest_reasons(db, [row.id for row in holdings])
    expense_reasons = latest_expense_reasons(db, [row.id for row in expenses])

    book_lines: list[BookLine] = []
    view_holdings: list[AssetHoldingViewOut] = []
    for row in holdings:
        display_minor = convert_minor(row.amount_minor, row.currency, display, rates)
        book_lines.append(
            BookLine(
                line_id=str(row.id),
                kind=row.kind,
                category=row.category,
                currency=row.currency,
                amount_minor=row.amount_minor,
                display_minor=display_minor,
                include_in_net_worth=row.include_in_net_worth,
                adjusted_at=row.adjusted_at,
            )
        )
        view_holdings.append(
            AssetHoldingViewOut(
                id=str(row.id),
                name=row.name,
                kind=row.kind,  # type: ignore[arg-type]
                category=row.category,
                currency=row.currency,
                amount_minor=row.amount_minor,
                institution=row.institution,
                note=row.note,
                adjusted_at=row.adjusted_at,
                include_in_net_worth=row.include_in_net_worth,
                needs_review=needs_review(row.adjusted_at, today),
                version=row.version,
                latest_reason=reasons.get(row.id),
                display_minor=display_minor,
                fx_missing=display_minor is None and row.currency != display,
            )
        )
    view_holdings.sort(
        key=lambda row: (*category_sort_key(row.kind, row.category), row.name.casefold(), row.id)
    )
    summary, group_totals = summarize_holdings(book_lines, today=today)

    expense_lines: list[ExpenseLine] = []
    view_expenses: list[AssetExpenseViewOut] = []
    for row in expenses:
        display_minor = convert_minor(row.amount_minor, row.currency, display, rates)
        expense_lines.append(
            ExpenseLine(
                item_id=str(row.id),
                group=row.group_kind,
                currency=row.currency,
                amount_minor=row.amount_minor,
                display_minor=display_minor,
            )
        )
        view_expenses.append(
            AssetExpenseViewOut(
                id=str(row.id),
                group_kind=row.group_kind,  # type: ignore[arg-type]
                name=row.name,
                currency=row.currency,
                amount_minor=row.amount_minor,
                adjusted_at=row.adjusted_at,
                version=row.version,
                latest_reason=expense_reasons.get(row.id),
                display_minor=display_minor,
                fx_missing=display_minor is None and row.currency != display,
            )
        )
    expense_summary = summarize_expenses(expense_lines)
    months = None
    if not summary.fx_incomplete and not expense_summary.fx_incomplete:
        months = coverage_months(summary.emergency_cash_minor, expense_summary.monthly_running_minor)

    currency_by_id = {line.line_id: line.currency for line in book_lines}
    adjustments = [
        BookAdjustment(
            holding_id=str(row.holding_id),
            amount_minor=row.amount_minor,
            currency=currency_by_id[str(row.holding_id)],
            recorded_at=row.recorded_at,
        )
        for row in list_holding_adjustments(db, [row.id for row in holdings])
    ]
    series = net_worth_series(
        book_lines,
        adjustments,
        display_currency=display,
        rates=rates,
    )
    groups = _groups(group_totals, view_holdings)
    expense_groups = _expense_groups(expense_summary.groups, view_expenses)
    return MyAssetsViewOut(
        profile=profile,
        rates=[_rate_out(row) for row in rate_rows],
        summary=AssetsSummaryOut(
            display_currency=display,
            total_assets_minor=summary.total_assets_minor,
            total_liabilities_minor=summary.total_liabilities_minor,
            net_worth_minor=summary.net_worth_minor,
            spendable_net_worth_minor=summary.spendable_net_worth_minor,
            emergency_cash_minor=summary.emergency_cash_minor,
            credit_minor=summary.credit_minor,
            investment_minor=summary.investment_minor,
            restricted_minor=summary.restricted_minor,
            monthly_running_minor=expense_summary.monthly_running_minor,
            emergency_reserve_minor=expense_summary.emergency_minor,
            spending_total_minor=expense_summary.spending_total_minor,
            coverage_months=months,
            fx_incomplete=summary.fx_incomplete or expense_summary.fx_incomplete,
            missing_currencies=list(summary.missing_currencies),
            holding_count=summary.holding_count,
            needs_review_count=summary.needs_review_count,
            latest_adjusted_at=summary.latest_adjusted_at,
            focus=summary.focus if not expense_summary.fx_incomplete else "missing_fx",
        ),
        groups=groups,
        expense_groups=expense_groups,
        net_worth_series=[
            NetWorthPointOut(as_of=point.as_of, net_worth_minor=point.net_worth_minor) for point in series
        ],
    )


def _groups(totals, holdings: list[AssetHoldingViewOut]) -> list[HoldingGroupOut]:
    by_key: dict[tuple[str, str], list[AssetHoldingViewOut]] = {}
    for row in holdings:
        by_key.setdefault((row.kind, row.category), []).append(row)
    seen = set(by_key) | {(row.kind, row.category) for row in totals}
    ordered = sorted(seen, key=lambda item: category_sort_key(item[0], item[1]))
    total_by_key = {(row.kind, row.category): row for row in totals}
    result: list[HoldingGroupOut] = []
    for key in ordered:
        total = total_by_key.get(key)
        result.append(
            HoldingGroupOut(
                kind=key[0],  # type: ignore[arg-type]
                category=key[1],
                display_minor=total.display_minor if total else 0,
                fx_incomplete=total.fx_incomplete if total else False,
                holdings=by_key.get(key, []),
            )
        )
    return result


def _expense_groups(totals, items: list[AssetExpenseViewOut]) -> list[ExpenseGroupOut]:
    by_group: dict[str, list[AssetExpenseViewOut]] = {}
    for row in items:
        by_group.setdefault(row.group_kind, []).append(row)
    for rows in by_group.values():
        rows.sort(key=lambda row: (row.name.casefold(), row.id))
    total_by_group = {row.group: row for row in totals}
    present = list(EXPENSE_GROUP_ORDER)
    result: list[ExpenseGroupOut] = []
    for group in present:
        total = total_by_group.get(group)
        result.append(
            ExpenseGroupOut(
                group_kind=group,  # type: ignore[arg-type]
                display_minor=total.display_minor if total else 0,
                fx_incomplete=total.fx_incomplete if total else False,
                items=by_group.get(group, []),
            )
        )
    return result


def _rate_out(row) -> AssetFxRateOut:
    quantized = Decimal(row.cny_per_unit).quantize(Decimal("0.00000001"))
    text = f"{quantized:f}".rstrip("0").rstrip(".")
    return AssetFxRateOut(currency=row.currency, cny_per_unit=text or "0", updated_at=row.updated_at)
