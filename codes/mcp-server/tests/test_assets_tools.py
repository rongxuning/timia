import json

import pytest
import respx
from httpx import Response

from timia_mcp.config import Settings
from timia_mcp.errors import ReadonlyError
from timia_mcp.http_client import TimiaHttpClient
from timia_mcp.tools.assets import import_stock_positions_impl, quote_to_minor


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
    assert json.loads(mark.calls.last.request.content)["version"] == 4
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
        await import_stock_positions_impl(
            client,
            positions=[
                {
                    "symbol": "300757",
                    "name": "罗博特科",
                    "market": "a_share",
                    "shares": 1,
                    "cost_price": "1",
                    "market_price": "1",
                }
            ],
        )
