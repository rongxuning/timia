import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isolatedValueIndexes, positionTrend, summaryTrend } from "./stockTrendSeries.ts";
import type { StockDetail } from "../../types/api/views/stock.ts";

const labels = {
  netAssets: "净总资产",
  totalCost: "总成本",
  marketValue: "总市值",
  cash: "总现金",
  liability: "总负债",
  gain: "总收益",
};

const positionLabels = {
  marketValue: "总市值",
  costPrice: "成本价",
  shareCount: "股数",
  totalPnl: "总浮盈亏",
  periodPnl: "区间浮盈亏",
};

function detail(): StockDetail {
  return {
    account: { id: "a", name: "国泰君安", code: "S", account_number: "1" },
    flow: {
      display_currency: "CNY",
      fx_incomplete: false,
      net_assets_minor: 10,
      total_cost_minor: 4,
      total_assets_minor: 10,
      market_value_minor: 8,
      cash_minor: 2,
      liability_minor: 6,
      show_liability: false,
      gain_minor: -2,
      show_gain: false,
      bank_to_securities_minor: 4,
      securities_to_bank_minor: 0,
    },
    positions: [],
    series: [
      {
        as_of: "2026-11-01",
        net_assets_minor: 1,
        total_cost_minor: 2,
        market_value_minor: 3,
        cash_minor: 4,
        liability_minor: 5,
        gain_minor: 6,
        positions: [],
      },
      {
        as_of: "2026-11-02",
        net_assets_minor: 7,
        total_cost_minor: 8,
        market_value_minor: 9,
        cash_minor: 10,
        liability_minor: 11,
        gain_minor: 12,
        positions: [
          {
            id: "p1",
            name: "罗博特科",
            shares: 100,
            cost_price_minor: 200819,
            market_value_minor: 3000,
            total_pnl_minor: 400,
            period_pnl_minor: 400,
          },
        ],
      },
    ],
  };
}

describe("isolatedValueIndexes", () => {
  it("flags a day that has a value and no valued neighbor", () => {
    assert.deepEqual(isolatedValueIndexes([null, null, 3000]), [2]);
    assert.deepEqual(isolatedValueIndexes([1, 2, null, 4]), [3]);
    assert.deepEqual(isolatedValueIndexes([1, 2]), []);
  });
});

describe("summaryTrend", () => {
  it("keeps the six account totals and leaves individual stocks out", () => {
    const trend = summaryTrend(detail(), labels);
    assert.ok(trend);
    assert.deepEqual(
      trend.series.map((item) => item.label),
      ["净总资产", "总成本", "总市值", "总现金", "总负债", "总收益"],
    );
    assert.deepEqual(
      trend.series.find((item) => item.id === "net")?.values,
      [1, 7],
    );
  });
});

describe("positionTrend", () => {
  it("draws every figure on the position card, and leaves a gap before the position exists", () => {
    const trend = positionTrend(detail(), "p1", positionLabels, {
      money: (amount) => `¥${amount}`,
      quote: (amount) => `q${amount}`,
      shares: (count) => `${count}股`,
    });
    assert.ok(trend);
    assert.deepEqual(
      trend.series.map((item) => item.id),
      ["market", "cost", "shares", "total", "period"],
    );
    assert.deepEqual(trend.series[0]?.values, [null, 3000]);
    assert.deepEqual(trend.series[1]?.values, [null, 200819]);
    assert.deepEqual(trend.series[2]?.values, [null, 100]);
    assert.equal(trend.series[1]?.formatValue?.(200819), "q200819");
    assert.equal(trend.series[1]?.formatValue?.(null), "—");
    assert.equal(trend.series[2]?.formatValue?.(100), "100股");
    assert.equal(trend.series.find((item) => item.id === "total")?.signed, true);
    assert.equal(trend.series.find((item) => item.id === "period")?.signed, true);
    assert.equal(trend.series.find((item) => item.id === "market")?.signed, false);
  });
});
