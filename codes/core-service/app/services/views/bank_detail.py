"""Read model for one bank account over a date range."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import (
    AssetBankCreditBill,
    AssetBankInvestmentOp,
    AssetBankProduct,
    AssetBankSavingsTxn,
)
from app.models.user import User
from app.schemas.views.bank_detail import (
    BankAccountOut,
    BankCreditBillOut,
    BankDetailOut,
    BankInvestmentOpOut,
    BankProductDetailOut,
    BankProductOut,
    BankProductSeriesPointOut,
    BankSavingsTxnOut,
    BankSeriesPointOut,
    BankSummaryOut,
)
from app.services.asset_api import list_rates, profile_out
from app.services.assets_math import convert_minor
from app.services.bank_book import BANK_ACCOUNT_KINDS, _bank_account
from app.services.stock_flow import MAX_RANGE_DAYS


def build_bank_detail(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    start: date,
    end: date,
    zone_name: str,
    product_id: uuid.UUID | None = None,
) -> BankDetailOut:
    if end < start:
        raise HTTPException(status_code=400, detail="range_invalid")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail="range_too_long")
    try:
        zone = ZoneInfo(zone_name)
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(status_code=400, detail="timezone_invalid") from exc
    account = _bank_account(db, user.id, account_id)
    profile = profile_out(db, user)
    display = profile.display_currency
    rates = {row.currency: Decimal(row.cny_per_unit) for row in list_rates(db, user.id)}

    def convert(amount: int, currency: str) -> int | None:
        return convert_minor(amount, currency, display, rates)

    products = list(
        db.scalars(
            select(AssetBankProduct).where(
                AssetBankProduct.account_id == account.id,
                AssetBankProduct.archived_at.is_(None),
            )
        ).all()
    )
    by_id = {row.id: row for row in products}
    savings_txns = _savings_txns(db, list(by_id))
    investment_ops = _investment_ops(db, list(by_id))
    credit_bills = _credit_bills(db, list(by_id))

    cards: list[BankProductOut] = []
    fx_incomplete = False
    total_assets = 0
    for product in products:
        card, missing = _product_card(product, convert)
        cards.append(card)
        if missing:
            fx_incomplete = True
            continue
        if product.product_kind == "savings":
            converted = convert(product.balance_minor, product.currency)
            if converted is not None:
                total_assets += converted
        elif product.product_kind == "investment":
            converted = convert(product.value_minor, product.currency)
            if converted is not None:
                total_assets += converted

    series = _account_series(
        start,
        end,
        products,
        savings_txns,
        investment_ops,
        convert,
        zone,
    )
    selected = None
    if product_id is not None:
        product = by_id.get(product_id)
        if product is None:
            raise HTTPException(status_code=404, detail="not_found")
        selected = _selected_detail(
            product,
            start,
            end,
            savings_txns,
            investment_ops,
            credit_bills,
            convert,
            zone,
        )

    return BankDetailOut(
        account=BankAccountOut(
            id=str(account.id),
            name=account.name,
            code=account.code,
            account_kind=account.account_kind,
            account_number=account.account_number,
        ),
        summary=BankSummaryOut(
            display_currency=display,
            fx_incomplete=fx_incomplete,
            total_assets_minor=total_assets,
        ),
        products=cards,
        series=series,
        selected=selected,
    )


def _product_card(
    product: AssetBankProduct,
    convert,
) -> tuple[BankProductOut, bool]:
    missing = False
    floating: int | None = None
    if product.product_kind == "investment":
        value = convert(product.value_minor, product.currency)
        cost = convert(product.cost_minor, product.currency)
        if value is None or cost is None:
            missing = True
            floating = None
        else:
            floating = value - cost
    elif product.product_kind == "savings":
        if convert(product.balance_minor, product.currency) is None:
            missing = True
    else:
        if (
            convert(product.limit_minor, product.currency) is None
            or convert(product.statement_minor, product.currency) is None
        ):
            missing = True
    return (
        BankProductOut(
            id=str(product.id),
            name=product.name,
            product_kind=product.product_kind,  # type: ignore[arg-type]
            currency=product.currency,
            balance_minor=_display_or_raw(product.balance_minor, product.currency, convert),
            value_minor=_display_or_raw(product.value_minor, product.currency, convert),
            cost_minor=_display_or_raw(product.cost_minor, product.currency, convert),
            floating_pnl_minor=floating,
            limit_minor=_display_or_raw(product.limit_minor, product.currency, convert),
            statement_minor=_display_or_raw(product.statement_minor, product.currency, convert),
            paid_off=product.paid_off,
            fx_missing=missing,
            version=product.version,
            recorded_at=product.marked_at,
            current_balance_minor=product.balance_minor,
            current_value_minor=product.value_minor,
            current_cost_minor=product.cost_minor,
            current_limit_minor=product.limit_minor,
            current_statement_minor=product.statement_minor,
        ),
        missing,
    )


def _display_or_raw(amount: int, currency: str, convert) -> int:
    converted = convert(amount, currency)
    return amount if converted is None else converted


def _account_series(
    start: date,
    end: date,
    products: list[AssetBankProduct],
    savings_txns: list[AssetBankSavingsTxn],
    investment_ops: list[AssetBankInvestmentOp],
    convert,
    zone,
) -> list[BankSeriesPointOut]:
    """One node per calendar day that has a savings/investment record — not a daily fill."""
    event_days = {
        _local_day(row.recorded_at, zone)
        for row in savings_txns
        if start <= _local_day(row.recorded_at, zone) <= end
    } | {
        _local_day(row.recorded_at, zone)
        for row in investment_ops
        if start <= _local_day(row.recorded_at, zone) <= end
    }
    points: list[BankSeriesPointOut] = []
    for day in sorted(event_days):
        total = 0
        has_value = False
        for product in products:
            if product.product_kind == "savings":
                balance = _balance_on(day, product.id, savings_txns, zone)
                if balance is None:
                    continue
                converted = convert(balance, product.currency)
                if converted is not None:
                    total += converted
                    has_value = True
            elif product.product_kind == "investment":
                value = _investment_on(day, product.id, investment_ops, zone)
                if value is None:
                    continue
                converted = convert(value[0], product.currency)
                if converted is not None:
                    total += converted
                    has_value = True
        if has_value:
            points.append(BankSeriesPointOut(as_of=day, total_assets_minor=total))
    return points


def _selected_detail(
    product: AssetBankProduct,
    start: date,
    end: date,
    savings_txns: list[AssetBankSavingsTxn],
    investment_ops: list[AssetBankInvestmentOp],
    credit_bills: list[AssetBankCreditBill],
    convert,
    zone,
) -> BankProductDetailOut:
    card, _ = _product_card(product, convert)
    series: list[BankProductSeriesPointOut] = []
    savings_out: list[BankSavingsTxnOut] = []
    investment_out: list[BankInvestmentOpOut] = []
    credit_out: list[BankCreditBillOut] = []

    if product.product_kind == "savings":
        event_days = sorted(
            {
                _local_day(row.recorded_at, zone)
                for row in savings_txns
                if row.product_id == product.id
                and start <= _local_day(row.recorded_at, zone) <= end
            }
        )
        for day in event_days:
            balance = _balance_on(day, product.id, savings_txns, zone)
            if balance is None:
                continue
            converted = convert(balance, product.currency)
            if converted is not None:
                series.append(
                    BankProductSeriesPointOut(as_of=day, primary_minor=converted, secondary_minor=None)
                )
        for row in sorted(
            (txn for txn in savings_txns if txn.product_id == product.id),
            key=lambda item: (item.recorded_at, item.created_at),
            reverse=True,
        ):
            local = _local_day(row.recorded_at, zone)
            if start <= local <= end:
                balance = convert(row.balance_minor, product.currency)
                delta = convert(row.delta_minor, product.currency)
                if balance is None or delta is None:
                    continue
                savings_out.append(
                    BankSavingsTxnOut(
                        id=str(row.id),
                        balance_minor=balance,
                        delta_minor=delta,
                        reason=row.reason,
                        recorded_at=row.recorded_at,
                    )
                )
    elif product.product_kind == "investment":
        event_days = sorted(
            {
                _local_day(row.recorded_at, zone)
                for row in investment_ops
                if row.product_id == product.id
                and start <= _local_day(row.recorded_at, zone) <= end
            }
        )
        for day in event_days:
            shot = _investment_on(day, product.id, investment_ops, zone)
            if shot is None:
                continue
            value = convert(shot[0], product.currency)
            cost = convert(shot[1], product.currency)
            if value is not None and cost is not None:
                series.append(
                    BankProductSeriesPointOut(
                        as_of=day,
                        primary_minor=value,
                        secondary_minor=cost,
                    )
                )
        for row in sorted(
            (op for op in investment_ops if op.product_id == product.id),
            key=lambda item: (item.recorded_at, item.created_at),
            reverse=True,
        ):
            local = _local_day(row.recorded_at, zone)
            if start <= local <= end:
                value = convert(row.value_minor, product.currency)
                cost = convert(row.cost_minor, product.currency)
                cost_delta = convert(row.cost_delta_minor, product.currency)
                if value is None or cost is None or cost_delta is None:
                    continue
                investment_out.append(
                    BankInvestmentOpOut(
                        id=str(row.id),
                        value_minor=value,
                        cost_minor=cost,
                        cost_delta_minor=cost_delta,
                        reason=row.reason,
                        recorded_at=row.recorded_at,
                    )
                )
    else:
        # One node per month that actually has a bill — no carry-forward fill.
        months_with_bill = sorted(
            {
                row.year_month
                for row in credit_bills
                if row.product_id == product.id and row.year_month in set(_months_in_range(start, end))
            }
        )
        for year_month in months_with_bill:
            bill = _bill_on(year_month, product.id, credit_bills)
            if bill is None or bill.year_month != year_month:
                continue
            statement = convert(bill.statement_minor, product.currency)
            if statement is None:
                continue
            as_of = max(start, date(int(year_month[:4]), int(year_month[5:7]), 1))
            if as_of > end:
                continue
            series.append(
                BankProductSeriesPointOut(as_of=as_of, primary_minor=statement, secondary_minor=None)
            )
        for row in sorted(
            (bill for bill in credit_bills if bill.product_id == product.id),
            key=lambda item: (item.year_month, item.recorded_at),
            reverse=True,
        ):
            month_start = date(int(row.year_month[:4]), int(row.year_month[5:7]), 1)
            month_end = _month_end(month_start)
            if month_end < start or month_start > end:
                continue
            limit = convert(row.limit_minor, product.currency)
            statement = convert(row.statement_minor, product.currency)
            if limit is None or statement is None:
                continue
            credit_out.append(
                BankCreditBillOut(
                    id=str(row.id),
                    year_month=row.year_month,
                    limit_minor=limit,
                    statement_minor=statement,
                    paid_off=row.paid_off,
                    reason=row.reason,
                    recorded_at=row.recorded_at,
                )
            )

    return BankProductDetailOut(
        product=card,
        series=series,
        savings_txns=savings_out,
        investment_ops=investment_out,
        credit_bills=credit_out,
    )


def _balance_on(
    day: date,
    product_id: uuid.UUID,
    txns: list[AssetBankSavingsTxn],
    zone,
) -> int | None:
    prior = [
        row
        for row in txns
        if row.product_id == product_id and _local_day(row.recorded_at, zone) <= day
    ]
    if not prior:
        return None
    winner = max(prior, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
    return winner.balance_minor


def _investment_on(
    day: date,
    product_id: uuid.UUID,
    ops: list[AssetBankInvestmentOp],
    zone,
) -> tuple[int, int] | None:
    prior = [
        row
        for row in ops
        if row.product_id == product_id and _local_day(row.recorded_at, zone) <= day
    ]
    if not prior:
        return None
    winner = max(prior, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))
    return winner.value_minor, winner.cost_minor


def _bill_on(
    year_month: str,
    product_id: uuid.UUID,
    bills: list[AssetBankCreditBill],
) -> AssetBankCreditBill | None:
    matches = [
        row for row in bills if row.product_id == product_id and row.year_month == year_month
    ]
    if not matches:
        # Carry forward the latest bill on or before this month.
        prior = [
            row for row in bills if row.product_id == product_id and row.year_month <= year_month
        ]
        if not prior:
            return None
        return max(prior, key=lambda row: (row.year_month, row.recorded_at, row.created_at, str(row.id)))
    return max(matches, key=lambda row: (row.recorded_at, row.created_at, str(row.id)))


def _months_in_range(start: date, end: date) -> list[str]:
    months: list[str] = []
    cursor = date(start.year, start.month, 1)
    last = date(end.year, end.month, 1)
    while cursor <= last:
        months.append(cursor.strftime("%Y-%m"))
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return months


def _month_end(month_start: date) -> date:
    if month_start.month == 12:
        return date(month_start.year + 1, 1, 1) - timedelta(days=1)
    return date(month_start.year, month_start.month + 1, 1) - timedelta(days=1)


def _local_day(moment: datetime, zone) -> date:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=ZoneInfo("UTC"))
    return moment.astimezone(zone).date()


def _savings_txns(db: Session, product_ids: list[uuid.UUID]) -> list[AssetBankSavingsTxn]:
    if not product_ids:
        return []
    return list(
        db.scalars(
            select(AssetBankSavingsTxn).where(AssetBankSavingsTxn.product_id.in_(product_ids))
        ).all()
    )


def _investment_ops(db: Session, product_ids: list[uuid.UUID]) -> list[AssetBankInvestmentOp]:
    if not product_ids:
        return []
    return list(
        db.scalars(
            select(AssetBankInvestmentOp).where(AssetBankInvestmentOp.product_id.in_(product_ids))
        ).all()
    )


def _credit_bills(db: Session, product_ids: list[uuid.UUID]) -> list[AssetBankCreditBill]:
    if not product_ids:
        return []
    return list(
        db.scalars(
            select(AssetBankCreditBill).where(AssetBankCreditBill.product_id.in_(product_ids))
        ).all()
    )


# Re-export for tests / callers that need the constant.
__all__ = ["BANK_ACCOUNT_KINDS", "build_bank_detail"]
