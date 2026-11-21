import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { layoutStockTrend, trendDirection } from "./stockTrendLayout.ts";

const series = [
  { id: "market", scale: "money", values: [10, 30, 30, 5] },
  { id: "pnl", scale: "money", signed: true, values: [2, null, 4, -1] },
];

describe("layoutStockTrend", () => {
  it("joins each day with a straight segment and a dot", () => {
    const layout = layoutStockTrend(["d1", "d2", "d3", "d4"], series);
    assert.ok(layout);
    const market = layout.segments.filter((segment) => segment.id.startsWith("market-"));
    assert.deepEqual(
      market.map((segment) => segment.direction),
      ["up", "flat", "down"],
    );
    assert.equal(market[0]?.y1, layout.dots.find((dot) => dot.id === "market-0")?.cy);
    assert.equal(market[0]?.x2, layout.dots.find((dot) => dot.id === "market-1")?.cx);
    assert.equal(layout.dots.filter((dot) => dot.id.startsWith("market-")).length, 4);
    assert.equal(layout.segments.some((segment) => segment.id === "pnl-0-1"), false);
    assert.equal(layout.segments.find((segment) => segment.id === "pnl-2-3")?.direction, "down");
  });

  it("draws a solid frame and a dashed guide on every day", () => {
    const layout = layoutStockTrend(["d1", "d2", "d3", "d4"], series);
    assert.ok(layout);
    assert.equal(layout.axisX.y1, layout.axisX.y2);
    assert.equal(layout.axisY.x1, layout.axisY.x2);
    assert.equal(layout.axisX.x1, layout.plot.left);
    assert.equal(layout.axisY.y2, layout.plot.bottom);
    assert.equal(layout.dayGuides.length, 4);
    assert.ok(layout.grid.length >= 2);
    assert.ok(layout.yTicks.every((tick) => tick.y >= layout.plot.top && tick.y <= layout.plot.bottom));
    assert.deepEqual(
      layout.xTicks.map((tick) => tick.date),
      ["d1", "d2", "d3", "d4"],
    );
    assert.ok(layout.xTicks[0] && layout.xTicks[3] && layout.xTicks[3].x > layout.xTicks[0].x);
  });

  it("labels exact zero when a series crosses it", () => {
    const layout = layoutStockTrend(
      ["2026-11-13", "2026-11-14"],
      [{ id: "pnl", scale: "money", values: [-100, 200] }],
    );
    assert.ok(layout);
    assert.equal(layout.yTicks.some((tick) => Object.is(tick.value, 0)), true);
  });

  it("names an upward move up and a downward move down", () => {
    assert.equal(trendDirection(1, 2), "up");
    assert.equal(trendDirection(2, 1), "down");
    assert.equal(trendDirection(2, 2), "flat");
  });
});
