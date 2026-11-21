import json
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
import respx
from httpx import Response

from timia_mcp.config import Settings
from timia_mcp.errors import ReadonlyError, tool_error_from_http
from timia_mcp.http_client import TimiaHttpClient, TimiaHttpError
from timia_mcp.tools.assets import (
    get_stock_day_snapshot_impl,
    import_stock_positions_impl,
    quote_to_minor,
    resolve_recorded_at,
    upsert_asset_fx_rate_impl,
)

_POSITION = {
    "symbol": "300757",
    "name": "罗博特科",
    "market": "a_share",
    "shares": 3100,
    "cost_price": "200.819",
    "market_price": "202.050",
}


def test_quote_to_minor_keeps_three_decimals_and_a_negative_cost():
    assert quote_to_minor("200.819") == 200819
    assert quote_to_minor("-145.735") == -145735
    assert quote_to_minor("0.815") == 815


@respx.mock
async def test_import_creates_account_then_posts_positions(client):
    respx.get("http://timia.test/views/me/assets").mock(
        return_value=Response(200, json={"parties": []})
    )
    respx.post("http://timia.test/asset-accounts").mock(
        return_value=Response(
            201,
            json={
                "id": "acc-1",
                "name": "普通交易",
                "account_kind": "stock",
                "account_number": "BROKER",
            },
        )
    )
    respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(200, json={"positions": []})
    )
    create = respx.post("http://timia.test/asset-accounts/acc-1/stocks").mock(
        return_value=Response(
            201,
            json={
                "id": "pos-1",
                "symbol": "300757",
                "name": "罗博特科",
                "market": "a_share",
                "currency": "CNY",
                "shares": 3100,
                "cost_price_minor": 200819,
                "market_price_minor": 202050,
                "version": 1,
            },
        )
    )
    out = await import_stock_positions_impl(
        client,
        positions=[
            {
                "symbol": "300757",
                "name": "罗博特科",
                "market": "a_share",
                "shares": 3100,
                "cost_price": "200.819",
                "market_price": "202.050",
            }
        ],
    )
    body = json.loads(create.calls.last.request.content)
    assert body["cost_price_minor"] == 200819
    assert body["market_price_minor"] == 202050
    assert body["reason"] == "券商持仓导入"
    assert "recorded_at" not in body
    assert out["created_account"] is True
    assert out["positions"][0]["symbol"] == "300757"


@respx.mock
async def test_import_marks_existing_and_creates_the_rest(client):
    respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(
            200,
            json={"positions": [{"id": "pos-1", "symbol": "300757", "version": 4}]},
        )
    )
    create = respx.post("http://timia.test/asset-accounts/acc-1/stocks").mock(
        return_value=Response(
            201,
            json={
                "id": "pos-2",
                "symbol": "603083",
                "name": "剑桥科技",
                "market": "a_share",
                "currency": "CNY",
                "shares": 1500,
                "cost_price_minor": -145735,
                "market_price_minor": 94030,
                "version": 1,
            },
        )
    )
    mark = respx.post("http://timia.test/asset-accounts/acc-1/stocks/pos-1/marks").mock(
        return_value=Response(
            200,
            json={
                "id": "pos-1",
                "symbol": "300757",
                "name": "罗博特科",
                "market": "a_share",
                "currency": "CNY",
                "shares": 3100,
                "cost_price_minor": 200819,
                "market_price_minor": 202050,
                "version": 5,
            },
        )
    )
    out = await import_stock_positions_impl(
        client,
        account_id="acc-1",
        positions=[
            {
                "symbol": "603083",
                "name": "剑桥科技",
                "market": "a_share",
                "shares": 1500,
                "cost_price": "-145.735",
                "market_price": "94.030",
            },
            {
                "symbol": "300757",
                "name": "罗博特科",
                "market": "a_share",
                "shares": 3100,
                "cost_price": "200.819",
                "market_price": "202.050",
            },
        ],
    )
    assert json.loads(create.calls.last.request.content)["cost_price_minor"] == -145735
    marked = json.loads(mark.calls.last.request.content)
    assert marked["version"] == 4
    assert "recorded_at" not in marked
    assert [row["symbol"] for row in out["positions"]] == ["603083", "300757"]


async def test_readonly_import_raises():
    client = TimiaHttpClient(
        Settings(
            api_base="http://timia.test",
            pat="tm_pat_test",
            readonly=True,
            tool_profile="p0",
            timeout_seconds=5,
            default_timezone="Asia/Shanghai",
        )
    )
    with pytest.raises(ReadonlyError):
        await import_stock_positions_impl(client, positions=[_POSITION])


def _readonly_client() -> TimiaHttpClient:
    return TimiaHttpClient(
        Settings(
            api_base="http://timia.test",
            pat="tm_pat_test",
            readonly=True,
            tool_profile="p0",
            timeout_seconds=5,
            default_timezone="Asia/Shanghai",
        )
    )


def test_date_only_recorded_at_is_midnight_in_the_client_zone():
    zone = ZoneInfo("Asia/Shanghai")
    assert resolve_recorded_at("2026-11-20", zone) == datetime(2026, 11, 20, tzinfo=zone)
    assert resolve_recorded_at("2026-11-20T16:00:00+08:00", zone).isoformat() == (
        "2026-11-20T16:00:00+08:00"
    )
    assert resolve_recorded_at("2026-11-20T00:00:00", zone).isoformat() == (
        "2026-11-20T00:00:00+08:00"
    )


@respx.mock
async def test_import_writes_a_dated_snapshot_on_the_given_account(client):
    stocks = respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(
            200,
            json={"positions": [{"id": "pos-1", "symbol": "300757", "version": 4}]},
        )
    )
    create_account = respx.post("http://timia.test/asset-accounts").mock(
        return_value=Response(201, json={"id": "should-not"})
    )
    create = respx.post("http://timia.test/asset-accounts/acc-1/stocks").mock(
        return_value=Response(
            201,
            json={
                "id": "pos-2",
                "symbol": "00700",
                "name": "腾讯控股",
                "market": "hk_share",
                "currency": "HKD",
                "shares": 100,
                "cost_price_minor": 320000,
                "market_price_minor": 510500,
                "version": 1,
            },
        )
    )
    mark = respx.post("http://timia.test/asset-accounts/acc-1/stocks/pos-1/marks").mock(
        return_value=Response(
            200,
            json={
                "id": "pos-1",
                "symbol": "300757",
                "name": "罗博特科",
                "market": "a_share",
                "currency": "CNY",
                "shares": 3100,
                "cost_price_minor": 200819,
                "market_price_minor": 202050,
                "version": 5,
            },
        )
    )
    out = await import_stock_positions_impl(
        client,
        account_id="acc-1",
        recorded_at="2026-11-20",
        positions=[
            {
                "symbol": "00700",
                "name": "腾讯控股",
                "market": "hk_share",
                "shares": 100,
                "cost_price": "320.000",
                "market_price": "510.500",
            },
            _POSITION,
        ],
    )
    assert create_account.called is False
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat()
    assert stocks.calls.last.request.url.params["start"] == today
    assert stocks.calls.last.request.url.params["end"] == today
    assert stocks.calls.last.request.url.params["timezone"] == "Asia/Shanghai"
    created = json.loads(create.calls.last.request.content)
    marked = json.loads(mark.calls.last.request.content)
    assert created["recorded_at"] == "2026-11-20T00:00:00+08:00"
    assert created["symbol"] == "00700"
    assert created["market"] == "hk_share"
    assert marked["recorded_at"] == "2026-11-20T00:00:00+08:00"
    assert marked["version"] == 4
    assert created["reason"] == "券商持仓导入"
    assert out["created_account"] is False
    assert [row["recorded_at"] for row in out["positions"]] == [
        "2026-11-20T00:00:00+08:00",
        "2026-11-20T00:00:00+08:00",
    ]


@respx.mock
async def test_import_keeps_an_explicit_offset_and_rejects_exchange_suffixes(client):
    create = respx.post("http://timia.test/asset-accounts/acc-1/stocks").mock(
        return_value=Response(201, json={"id": "pos-1", "symbol": "300757", "version": 1})
    )
    rejected = await import_stock_positions_impl(
        client,
        account_id="acc-1",
        positions=[{**_POSITION, "symbol": "300757.SZ"}],
    )
    assert rejected == {"error": "symbol_invalid"}
    assert create.called is False

    respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(200, json={"positions": []})
    )
    await import_stock_positions_impl(
        client,
        account_id="acc-1",
        recorded_at="2026-11-20T16:00:00+08:00",
        positions=[_POSITION],
    )
    body = json.loads(create.calls.last.request.content)
    assert body["recorded_at"] == "2026-11-20T16:00:00+08:00"
    assert body["symbol"] == "300757"


@respx.mock
async def test_import_mark_conflict_surfaces_version_conflict(client):
    respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(
            200,
            json={"positions": [{"id": "pos-1", "symbol": "300757", "version": 4}]},
        )
    )
    respx.post("http://timia.test/asset-accounts/acc-1/stocks/pos-1/marks").mock(
        return_value=Response(409, json={"detail": "version_conflict"})
    )
    with pytest.raises(TimiaHttpError) as exc_info:
        await import_stock_positions_impl(
            client,
            account_id="acc-1",
            recorded_at="2026-11-20T16:00:00+08:00",
            positions=[_POSITION],
        )
    err = tool_error_from_http(exc_info.value.status, exc_info.value.detail)
    assert err["error"] == "version_conflict"
    assert err["http_status"] == 409


@respx.mock
async def test_upsert_fx_rate_puts_hkd(client):
    route = respx.put("http://timia.test/asset-fx-rates").mock(
        return_value=Response(
            200,
            json={
                "currency": "HKD",
                "cny_per_unit": "0.84944",
                "updated_at": "2026-11-21T01:00:00Z",
            },
        )
    )
    out = await upsert_asset_fx_rate_impl(client, "hkd", "0.84944")
    assert json.loads(route.calls.last.request.content) == {
        "currency": "HKD",
        "cny_per_unit": "0.84944",
    }
    assert out["currency"] == "HKD"
    assert out["cny_per_unit"] == "0.84944"
    assert out["updated_at"] == "2026-11-21T01:00:00Z"


@respx.mock
async def test_upsert_fx_rate_rejects_cny_and_maps_403(client):
    route = respx.put("http://timia.test/asset-fx-rates").mock(
        return_value=Response(403, json={"detail": "insufficient_scope"})
    )
    assert await upsert_asset_fx_rate_impl(client, "CNY", "1") == {"error": "cny_rate_fixed"}
    assert route.called is False
    with pytest.raises(TimiaHttpError) as exc_info:
        await upsert_asset_fx_rate_impl(client, "HKD", "0.84944")
    assert exc_info.value.status == 403
    assert exc_info.value.detail == "insufficient_scope"


async def test_readonly_fx_rate_raises():
    with pytest.raises(ReadonlyError):
        await upsert_asset_fx_rate_impl(_readonly_client(), "HKD", "0.84944")


@respx.mock
async def test_day_snapshot_lists_only_marks_on_that_calendar_day(client):
    route = respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(
            200,
            json={
                "positions": [
                    {
                        "symbol": "603083",
                        "shares": 1500,
                        "cost_price_minor": -145735,
                        "market_price_minor": 94030,
                        "currency": "CNY",
                        "recorded_at": "2026-11-19T10:00:00+08:00",
                    },
                    {
                        "symbol": "300757",
                        "shares": 3100,
                        "cost_price_minor": 200819,
                        "market_price_minor": 202050,
                        "currency": "CNY",
                        "recorded_at": "2026-11-19T16:00:00+00:00",
                        "name": "罗博特科",
                    },
                    {
                        "symbol": "00700",
                        "shares": 100,
                        "cost_price_minor": 320000,
                        "market_price_minor": 510500,
                        "currency": "HKD",
                        "recorded_at": "2026-11-20T00:00:00+08:00",
                        "version": 2,
                    },
                ]
            },
        )
    )
    out = await get_stock_day_snapshot_impl(client, "acc-1", "2026-11-20")
    params = route.calls.last.request.url.params
    assert params["start"] == "2026-11-20"
    assert params["end"] == "2026-11-20"
    assert params["timezone"] == "Asia/Shanghai"
    assert out["has_snapshot"] is True
    assert out["positions"] == [
        {
            "symbol": "300757",
            "shares": 3100,
            "cost_price_minor": 200819,
            "market_price_minor": 202050,
            "currency": "CNY",
            "recorded_at": "2026-11-19T16:00:00+00:00",
        },
        {
            "symbol": "00700",
            "shares": 100,
            "cost_price_minor": 320000,
            "market_price_minor": 510500,
            "currency": "HKD",
            "recorded_at": "2026-11-20T00:00:00+08:00",
        },
    ]


@respx.mock
async def test_day_snapshot_is_empty_when_marks_are_from_another_day(client):
    respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(
            200,
            json={
                "positions": [
                    {
                        "symbol": "300757",
                        "shares": 3100,
                        "cost_price_minor": 200819,
                        "market_price_minor": 202050,
                        "currency": "CNY",
                        "recorded_at": "2026-11-19T10:00:00+08:00",
                    }
                ]
            },
        )
    )
    missing = await get_stock_day_snapshot_impl(
        client, "acc-1", "2026-11-20", timezone="Asia/Shanghai"
    )
    assert missing["has_snapshot"] is False
    assert missing["positions"] == []
    assert await get_stock_day_snapshot_impl(client, "acc-1", "20-11-2026") == {
        "error": "day_invalid"
    }
    assert await get_stock_day_snapshot_impl(
        client, "acc-1", "2026-11-20", timezone="Not/AZone"
    ) == {"error": "timezone_invalid"}


@respx.mock
async def test_day_snapshot_unauthorized(client):
    respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(401, json={"detail": "unauthorized"})
    )
    with pytest.raises(TimiaHttpError) as exc_info:
        await get_stock_day_snapshot_impl(client, "acc-1", "2026-11-20")
    err = tool_error_from_http(exc_info.value.status, exc_info.value.detail)
    assert err["error"] == "unauthorized"
    assert err["http_status"] == 401


@respx.mock
async def test_readonly_day_snapshot_still_reads():
    respx.get("http://timia.test/views/me/assets/accounts/acc-1/stocks").mock(
        return_value=Response(200, json={"positions": []})
    )
    out = await get_stock_day_snapshot_impl(_readonly_client(), "acc-1", "2026-11-20")
    assert out["has_snapshot"] is False
    assert out["timezone"] == "Asia/Shanghai"
