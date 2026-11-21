"""Import stock positions into the personal asset book.

Quotes use three decimal places. A cost of 200.819 is sent as 200819.
Negative costs are allowed. Market prices stay at or above zero.
"""

from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from zoneinfo import ZoneInfo

from timia_mcp.auth import assert_writable
from timia_mcp.http_client import TimiaHttpClient

_QUOTE_SCALE = Decimal(1000)
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


def quote_to_minor(value: str) -> int:
    text = value.strip().replace(",", "")
    if not text:
        raise ValueError("amount_invalid")
    amount = Decimal(text)
    milli = (amount * _QUOTE_SCALE).quantize(Decimal(1), rounding=ROUND_HALF_UP)
    return int(milli)


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


async def import_stock_positions_impl(
    client: TimiaHttpClient,
    positions: list[dict[str, Any]],
    account_id: str | None = None,
    reason: str = "券商持仓导入",
) -> dict[str, Any]:
    """Create or update positions on one stock account. Writes real balances."""
    assert_writable(client._settings)
    if not positions:
        return {"error": "positions_required"}
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

    zone = ZoneInfo(client._settings.default_timezone)
    today = datetime.now(zone).date().isoformat()
    detail = await client.request(
        "GET",
        f"/views/me/assets/accounts/{account_id}/stocks",
        params={"start": today, "end": today, "timezone": client._settings.default_timezone},
    )
    existing = {str(row.get("symbol", "")).upper(): row for row in detail.get("positions") or []}
    saved: list[dict[str, Any]] = []
    for row in positions:
        symbol = str(row["symbol"]).strip().upper()
        payload = {
            "shares": int(row["shares"]),
            "cost_price_minor": quote_to_minor(str(row["cost_price"])),
            "market_price_minor": quote_to_minor(str(row["market_price"])),
            "reason": reason,
        }
        if payload["market_price_minor"] < 0:
            raise ValueError("amount_invalid")
        current = existing.get(symbol)
        if current is None:
            data = await client.request(
                "POST",
                f"/asset-accounts/{account_id}/stocks",
                json={
                    "symbol": symbol,
                    "name": str(row["name"]).strip(),
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
        saved.append(_trim(data))
    return {
        "account_id": account_id,
        "created_account": created_account,
        "positions": saved,
    }
