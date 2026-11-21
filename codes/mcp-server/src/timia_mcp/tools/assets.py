"""Import stock positions and read day snapshots for the personal asset book.

Quotes use three decimal places. A cost of 200.819 is sent as 200819.
Negative costs are allowed. Market prices stay at or above zero.
A date-only recorded_at is 00:00 in the client timezone, not the server clock.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from timia_mcp.auth import assert_writable
from timia_mcp.http_client import TimiaHttpClient

_QUOTE_SCALE = Decimal(1000)
_RATE_QUANTUM = Decimal("0.00000001")
_SYMBOL = re.compile(r"^[A-Z0-9]{1,12}$")
_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_MARKETS = frozenset({"a_share", "hk_share"})
_WRITE_KEYS = (
    "id",
    "symbol",
    "name",
    "market",
    "currency",
    "shares",
    "cost_price_minor",
    "market_price_minor",
    "version",
)
_SNAPSHOT_KEYS = (
    "symbol",
    "shares",
    "cost_price_minor",
    "market_price_minor",
    "currency",
    "recorded_at",
)


def quote_to_minor(value: str) -> int:
    text = value.strip().replace(",", "")
    if not text:
        raise ValueError("amount_invalid")
    try:
        amount = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError("amount_invalid") from exc
    if not amount.is_finite():
        raise ValueError("amount_invalid")
    milli = (amount * _QUOTE_SCALE).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(milli)


def resolve_recorded_at(value: str, zone: ZoneInfo) -> datetime:
    """ISO datetime, or YYYY-MM-DD at 00:00 in the client timezone."""
    text = value.strip()
    if _DAY.fullmatch(text):
        try:
            year, month, day = (int(part) for part in text.split("-"))
            return datetime(year, month, day, tzinfo=zone)
        except ValueError as exc:
            raise ValueError("recorded_at_invalid") from exc
    try:
        moment = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError("recorded_at_invalid") from exc
    if moment.tzinfo is None:
        return moment.replace(tzinfo=zone)
    return moment


def _zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("timezone_invalid") from exc


def _trim(row: dict[str, Any]) -> dict[str, Any]:
    return {key: row[key] for key in _WRITE_KEYS if key in row}


def _stock_accounts(view: dict[str, Any]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for party in view.get("parties") or []:
        for account in party.get("accounts") or []:
            if account.get("account_kind") == "stock":
                found.append(
                    {
                        "id": account.get("id"),
                        "name": account.get("name"),
                        "account_number": account.get("account_number"),
                    }
                )
    return found


def _share_count(value: Any) -> int:
    if type(value) is int:
        return value
    if type(value) is float:
        if not value.is_integer():
            raise ValueError("amount_invalid")
        return int(value)
    if not isinstance(value, str):
        raise ValueError("amount_invalid")  # noqa: TRY004 — API error code, not a Python type
    text = value.strip().removeprefix("+")
    negative = text.startswith("-")
    digits = text[1:] if negative else text
    if not digits.isdigit():
        raise ValueError("amount_invalid")
    return int(text)


def _prepare_position(row: Any) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise ValueError("positions_invalid")  # noqa: TRY004 — API error code, not a Python type
    symbol = str(row.get("symbol", "")).strip().upper()
    if _SYMBOL.fullmatch(symbol) is None:
        raise ValueError("symbol_invalid")
    if row.get("market") not in _MARKETS:
        raise ValueError("market_invalid")
    name = str(row.get("name", "")).strip()
    if not name:
        raise ValueError("name_required")
    try:
        shares = _share_count(row["shares"])
        cost = quote_to_minor(str(row["cost_price"]))
        market_price = quote_to_minor(str(row["market_price"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("amount_invalid") from exc
    if shares < 0 or market_price < 0:
        raise ValueError("amount_invalid")
    return {
        "symbol": symbol,
        "name": name,
        "market": row["market"],
        "shares": shares,
        "cost_price_minor": cost,
        "market_price_minor": market_price,
    }


def _lookup_day(zone: ZoneInfo, recorded: datetime | None) -> str:
    """Find symbols that already exist, including ones opened after a backfill.

    Querying only the historical day would miss a later position and create
    a second row for the same symbol.
    """
    today = datetime.now(zone).date()
    if recorded is None:
        return today.isoformat()
    return max(today, recorded.astimezone(zone).date()).isoformat()


def _rate_text(value: str) -> str:
    try:
        amount = Decimal(str(value).strip())
    except InvalidOperation as exc:
        raise ValueError("amount_invalid") from exc
    if not amount.is_finite() or amount <= 0:
        raise ValueError("amount_invalid")
    quantized = amount.quantize(_RATE_QUANTUM, rounding=ROUND_HALF_UP)
    text = format(quantized, "f").rstrip("0").rstrip(".")
    if text in {"", "0"}:
        raise ValueError("amount_invalid")
    return text


def _recorded_on_day(value: Any, day: date, zone: ZoneInfo) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        moment = datetime.fromisoformat(value)
    except ValueError:
        return False
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=zone)
    return moment.astimezone(zone).date() == day


async def import_stock_positions_impl(
    client: TimiaHttpClient,
    positions: list[dict[str, Any]],
    account_id: str | None = None,
    reason: str = "券商持仓导入",
    recorded_at: str | None = None,
) -> dict[str, Any]:
    """Create or update positions on one stock account. Writes real balances."""
    assert_writable(client._settings)
    if not positions:
        return {"error": "positions_required"}
    try:
        zone = _zone(client._settings.default_timezone)
        prepared = [_prepare_position(row) for row in positions]
        recorded = resolve_recorded_at(recorded_at, zone) if recorded_at else None
    except ValueError as exc:
        return {"error": str(exc)}
    recorded_iso = recorded.isoformat() if recorded is not None else None

    created_account = False
    if not account_id:
        view = await client.request("GET", "/views/me/assets")
        accounts = _stock_accounts(view)
        if len(accounts) == 1:
            account_id = str(accounts[0]["id"])
        elif len(accounts) > 1:
            return {"error": "account_id_required", "accounts": accounts}
        else:
            created = await client.request(
                "POST",
                "/asset-accounts",
                json={
                    "name": "普通交易",
                    "account_kind": "stock",
                    "account_number": "BROKER",
                },
            )
            account_id = str(created["id"])
            created_account = True

    lookup = _lookup_day(zone, recorded)
    detail = await client.request(
        "GET",
        f"/views/me/assets/accounts/{account_id}/stocks",
        params={
            "start": lookup,
            "end": lookup,
            "timezone": client._settings.default_timezone,
        },
    )
    existing = {str(row.get("symbol", "")).upper(): row for row in detail.get("positions") or []}
    saved: list[dict[str, Any]] = []
    for row in prepared:
        payload: dict[str, Any] = {
            "shares": row["shares"],
            "cost_price_minor": row["cost_price_minor"],
            "market_price_minor": row["market_price_minor"],
            "reason": reason,
        }
        if recorded_iso is not None:
            payload["recorded_at"] = recorded_iso
        current = existing.get(row["symbol"])
        if current is None:
            data = await client.request(
                "POST",
                f"/asset-accounts/{account_id}/stocks",
                json={
                    "symbol": row["symbol"],
                    "name": row["name"],
                    "market": row["market"],
                    **payload,
                },
            )
        else:
            data = await client.request(
                "POST",
                f"/asset-accounts/{account_id}/stocks/{current['id']}/marks",
                json={"version": current["version"], **payload},
            )
        trimmed = _trim(data)
        if recorded_iso is not None:
            trimmed["recorded_at"] = recorded_iso
        saved.append(trimmed)
    return {
        "account_id": account_id,
        "created_account": created_account,
        "positions": saved,
    }


async def upsert_asset_fx_rate_impl(
    client: TimiaHttpClient,
    currency: str,
    cny_per_unit: str,
) -> dict[str, Any]:
    """Upsert how many CNY one unit of currency is worth. Writes a real rate."""
    assert_writable(client._settings)
    code = currency.strip().upper()
    if len(code) != 3 or not code.isalpha():
        return {"error": "unsupported_currency"}
    if code == "CNY":
        return {"error": "cny_rate_fixed"}
    try:
        rate = _rate_text(cny_per_unit)
    except ValueError as exc:
        return {"error": str(exc)}
    data = await client.request(
        "PUT",
        "/asset-fx-rates",
        json={"currency": code, "cny_per_unit": rate},
    )
    return {
        "currency": data.get("currency", code),
        "cny_per_unit": data.get("cny_per_unit", rate),
        "updated_at": data.get("updated_at"),
    }


async def get_stock_day_snapshot_impl(
    client: TimiaHttpClient,
    account_id: str,
    day: str,
    timezone: str | None = None,
) -> dict[str, Any]:
    """Report marks recorded on one calendar day. Does not write balances."""
    text = day.strip()
    if _DAY.fullmatch(text) is None:
        return {"error": "day_invalid"}
    try:
        target = date.fromisoformat(text)
        zone_name = timezone or client._settings.default_timezone
        zone = _zone(zone_name)
    except ValueError as exc:
        code = str(exc)
        if code == "timezone_invalid":
            return {"error": code}
        return {"error": "day_invalid"}
    detail = await client.request(
        "GET",
        f"/views/me/assets/accounts/{account_id}/stocks",
        params={"start": text, "end": text, "timezone": zone_name},
    )
    positions = [
        {key: row[key] for key in _SNAPSHOT_KEYS if key in row}
        for row in detail.get("positions") or []
        if isinstance(row, dict) and _recorded_on_day(row.get("recorded_at"), target, zone)
    ]
    return {
        "account_id": account_id,
        "day": text,
        "timezone": zone_name,
        "has_snapshot": bool(positions),
        "positions": positions,
    }
