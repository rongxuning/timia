import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysBetween, layoutStockTrend, trendDirection } from "./stockTrendLayout.ts";

const days = ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"];
const series = [
  { id: "market", scale: "money", values: [10, 30, 30, 5] },
  { id: "pnl", scale: "money", signed: true, values: [2, null, 4, -1] },
];

describe("layoutStockTrend", () => {
  it("joins each day with a straight segment and a dot", () => {
    const layout = layoutStockTrend(days, series);
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

  it("draws a solid frame and interior dashed guides", () => {
    const layout = layoutStockTrend(days, series);
    assert.ok(layout);
    assert.equal(layout.axisX.y1, layout.axisX.y2);
    assert.equal(layout.axisY.x1, layout.axisY.x2);
    assert.equal(layout.axisX.x1, layout.plot.left);
    assert.equal(layout.axisY.y2, layout.plot.bottom);
    // First/last day sit on the frame; only interior days get dashed verticals.
    assert.equal(layout.dayGuides.length, 2);
    assert.ok(layout.dayGuides.every((line) => line.x1 > layout.plot.left && line.x1 < layout.plot.right));
    assert.ok(layout.grid.length >= 1);
    assert.ok(layout.grid.every((line) => line.y1 > layout.plot.top && line.y1 < layout.plot.bottom));
    assert.ok(layout.yTicks.every((tick) => tick.y >= layout.plot.top && tick.y <= layout.plot.bottom));
    assert.deepEqual(
      layout.xTicks.map((tick) => tick.date),
      days,
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

  it("connects successive event days across a weekend gap", () => {
    const layout = layoutStockTrend(
      ["2026-11-13", "2026-11-16", "2026-11-17"],
      [{ id: "market", scale: "money", values: [10, 40, 20] }],
    );
    assert.ok(layout);
    assert.deepEqual(
      layout.segments.map((segment) => segment.id),
      ["market-0-1", "market-1-2"],
    );
    assert.equal(layout.dots.length, 3);
    assert.equal(daysBetween("2026-11-13", "2026-11-14"), 1);
    assert.equal(daysBetween("2026-11-13", "2026-11-16"), 3);
  });

  it("keeps a readout-only series off the plot and off the scale", () => {
    const layout = layoutStockTrend(
      ["2026-11-13", "2026-11-14"],
      [
        { id: "market", scale: "money", drawn: false, values: [1_000_000, 1_000_000] },
        { id: "pnl", scale: "money", paint: "signed", values: [10, -10] },
      ],
    );
    assert.ok(layout);
    assert.equal(
      layout.segments.some((segment) => segment.seriesId === "market"),
      false,
    );
    assert.equal(layout.dots.some((dot) => dot.seriesId === "market"), false);
    assert.ok(layout.yTicks.every((tick) => Math.abs(tick.value) < 1000));
  });

  it("names an upward move up and a downward move down", () => {
    assert.equal(trendDirection(1, 2), "up");
    assert.equal(trendDirection(2, 1), "down");
    assert.equal(trendDirection(2, 2), "flat");
  });

  it("keeps a falling profit run red and splits the line where it crosses zero", () => {
    const layout = layoutStockTrend(
      ["2026-11-13", "2026-11-14", "2026-11-15"],
      [
        { id: "cost", scale: "quote", paint: "solid", values: [10, 12, 11] },
        { id: "pnl", scale: "money", paint: "signed", values: [100, 40, -100] },
      ],
    );
    assert.ok(layout);
    const cost = layout.segments.filter((segment) => segment.seriesId === "cost");
    assert.equal(cost.length, 2);
    assert.ok(cost.every((segment) => segment.paint === "solid"));
    const pnl = layout.segments.filter((segment) => segment.seriesId === "pnl");
    assert.deepEqual(
      pnl.map((segment) => segment.sign),
      ["profit", "profit", "loss"],
    );
    assert.equal(pnl[0]?.direction, "down");
    assert.equal(pnl[1]?.x2, pnl[2]?.x1);
    assert.equal(pnl[1]?.y2, pnl[2]?.y1);
    const zero = layout.yTicks.find((tick) => Object.is(tick.value, 0));
    assert.ok(zero);
    assert.ok(pnl[1] && Math.abs(pnl[1].y2 - zero.y) < 0.01);
  });
});
