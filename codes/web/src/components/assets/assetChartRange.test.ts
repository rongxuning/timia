import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountBalanceTotals,
  buildCalendarCells,
  chartAxisDates,
  filterDailySeries,
  lineChartLayout,
  monthRange,
  monthStep,
  nearestChartIndex,
  nextRangeAfterPick,
  pointerXInViewBox,
  shiftMonth,
  weekdayHeaderLabels,
} from "./assetChartRange.ts";

const today = "2026-11-20";

describe("monthRange", () => {
  it("clamps the current month to today", () => {
    assert.deepEqual(monthRange("2026-11", today), { start: "2026-11-01", end: "2026-11-20" });
  });

  it("uses the full month when that month is already over", () => {
    assert.deepEqual(monthRange("2026-10", today), { start: "2026-10-01", end: "2026-10-31" });
    assert.deepEqual(monthRange("2024-02", today), { start: "2024-02-01", end: "2024-02-29" });
    assert.deepEqual(monthRange("2026-02", today), { start: "2026-02-01", end: "2026-02-28" });
  });

  it("does not open a range after today", () => {
    assert.deepEqual(monthRange("2026-12", today), { start: today, end: today });
  });
});

describe("monthStep", () => {
  it("moves the curve window with the month when no end date is pending", () => {
    assert.deepEqual(monthStep("2026-11", -1, today, null), {
      month: "2026-10",
      range: { start: "2026-10-01", end: "2026-10-31" },
    });
  });

  it("keeps the committed range while an end date is still being picked", () => {
    assert.deepEqual(monthStep("2026-11", -1, today, "2026-11-03"), {
      month: "2026-10",
      range: null,
    });
  });

  it("refuses to page into a future month", () => {
    assert.deepEqual(monthStep("2026-11", 1, today, null), { month: "2026-11", range: null });
  });

  it("crosses the year boundary", () => {
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
  });
});

describe("nextRangeAfterPick", () => {
  const current = { start: "2026-11-01", end: "2026-11-20" };

  it("arms the first click without moving the curves", () => {
    assert.deepEqual(nextRangeAfterPick(current, null, "2026-10-05"), {
      range: current,
      pending: "2026-10-05",
    });
  });

  it("commits an ordered range on the second click", () => {
    assert.deepEqual(nextRangeAfterPick(current, "2026-10-20", "2026-10-05"), {
      range: { start: "2026-10-05", end: "2026-10-20" },
      pending: null,
    });
  });
});

describe("buildCalendarCells", () => {
  it("pads November 2026 from Monday, Saturday, and Sunday", () => {
    const monday = buildCalendarCells("2026-11", 1);
    const saturday = buildCalendarCells("2026-11", 6);
    const sunday = buildCalendarCells("2026-11", 7);
    assert.equal(monday[6]?.date, "2026-11-01");
    assert.equal(monday.find((cell) => cell?.day === 30)?.date, "2026-11-30");
    assert.equal(saturday[1]?.date, "2026-11-01");
    assert.equal(sunday[0]?.date, "2026-11-01");
    for (const cells of [monday, saturday, sunday]) {
      assert.equal(cells.length % 7, 0);
      assert.equal(cells.filter((cell) => cell?.day).length, 30);
    }
  });
});

describe("weekdayHeaderLabels", () => {
  it("rotates the first column with the week start", () => {
    const monday = weekdayHeaderLabels("en-US", 1);
    const sunday = weekdayHeaderLabels("en-US", 7);
    assert.equal(monday.length, 7);
    assert.equal(monday[0], "M");
    assert.equal(sunday[0], "S");
    assert.notEqual(monday[0], sunday[0]);
  });
});

describe("chartAxisDates", () => {
  function days(start: string, end: string) {
    const out: string[] = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cursor.getTime() <= last.getTime()) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }

  it("keeps only the two ends when the span is a week or shorter", () => {
    assert.deepEqual(chartAxisDates(["2026-11-01"]), ["2026-11-01"]);
    assert.deepEqual(chartAxisDates(days("2026-11-01", "2026-11-08")), ["2026-11-01", "2026-11-08"]);
  });

  it("inserts Mondays between the ends, skipping one that would sit on an endpoint label", () => {
    assert.deepEqual(chartAxisDates(days("2026-11-01", "2026-11-21")), [
      "2026-11-01",
      "2026-11-09",
      "2026-11-16",
      "2026-11-21",
    ]);
    assert.deepEqual(chartAxisDates(days("2026-11-02", "2026-11-16")), [
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
  });
});

describe("filterDailySeries", () => {
  const series = [
    { as_of: "2026-11-01", assets_minor: 10, liabilities_minor: 2, net_worth_minor: 8 },
    { as_of: "2026-11-02", assets_minor: 12, liabilities_minor: 2, net_worth_minor: 10 },
    { as_of: "2026-11-03", assets_minor: 9, liabilities_minor: 4, net_worth_minor: 5 },
  ];

  it("keeps days inside the range, including both ends, in either order", () => {
    assert.deepEqual(
      filterDailySeries(series, "2026-11-03", "2026-11-02").map((point) => point.as_of),
      ["2026-11-02", "2026-11-03"],
    );
  });
});

describe("lineChartLayout", () => {
  it("puts a higher balance above an earlier one", () => {
    const layout = lineChartLayout([
      { as_of: "2026-11-01", value: 10 },
      { as_of: "2026-11-02", value: 30 },
    ]);
    assert.ok(layout);
    assert.ok(layout.coords[0].x < layout.coords[1].x);
    assert.ok(layout.coords[1].y < layout.coords[0].y);
    assert.match(layout.line, /^M/);
    assert.match(layout.area, /Z$/);
  });

  it("draws a flat series through the middle", () => {
    const layout = lineChartLayout([
      { as_of: "2026-11-01", value: 40 },
      { as_of: "2026-11-02", value: 40 },
    ]);
    assert.ok(layout);
    assert.equal(layout.coords[0].y, layout.coords[1].y);
    assert.ok(layout.coords[0].y > 16);
    assert.ok(layout.coords[0].y < layout.baseline);
  });

  it("centers a single day", () => {
    const layout = lineChartLayout([{ as_of: "2026-11-20", value: 5 }]);
    assert.ok(layout);
    assert.equal(layout.line, "");
    assert.equal(layout.coords[0].x, (640 - 12 - 12) / 2 + 12);
  });

  it("spreads the line across a wider plot", () => {
    const layout = lineChartLayout(
      [
        { as_of: "2026-11-01", value: 1 },
        { as_of: "2026-11-21", value: 2 },
      ],
      1200,
      144,
    );
    assert.ok(layout);
    assert.equal(layout.width, 1200);
    assert.ok(layout.coords[0].x < 20);
    assert.ok(layout.coords[1].x > 1180);
  });

  it("returns nothing when the range has no points", () => {
    assert.equal(lineChartLayout([]), null);
  });
});

describe("pointerXInViewBox", () => {
  it("ignores horizontal letterboxing from xMidYMid meet", () => {
    const viewWidth = 640;
    const viewHeight = 168;
    const elementWidth = 900;
    const elementHeight = 144;
    const scale = elementHeight / viewHeight;
    const contentWidth = viewWidth * scale;
    const padX = (elementWidth - contentWidth) / 2;
    assert.equal(pointerXInViewBox(0, elementWidth, elementHeight, viewWidth, viewHeight), 0);
    assert.equal(pointerXInViewBox(padX, elementWidth, elementHeight, viewWidth, viewHeight), 0);
    assert.ok(Math.abs(pointerXInViewBox(padX + contentWidth / 2, elementWidth, elementHeight, viewWidth, viewHeight) - 320) < 0.001);
    assert.equal(pointerXInViewBox(elementWidth, elementWidth, elementHeight, viewWidth, viewHeight), viewWidth);
  });
});

describe("accountBalanceTotals", () => {
  it("counts included assets and liabilities, and skips missing rates", () => {
    assert.deepEqual(
      accountBalanceTotals([
        { kind: "asset", display_minor: 500, include_in_net_worth: true },
        { kind: "liability", display_minor: 125, include_in_net_worth: true },
        { kind: "asset", display_minor: 80, include_in_net_worth: false },
        { kind: "asset", display_minor: null, include_in_net_worth: true },
      ]),
      { assets_minor: 500, liabilities_minor: 125, net_worth_minor: 375 },
    );
  });
});

describe("nearestChartIndex", () => {
  it("picks the closest plotted day", () => {
    const layout = lineChartLayout([
      { as_of: "2026-11-01", value: 1 },
      { as_of: "2026-11-02", value: 2 },
      { as_of: "2026-11-03", value: 3 },
    ]);
    assert.ok(layout);
    const mid = (layout.coords[1].x + layout.coords[2].x) / 2;
    assert.equal(nearestChartIndex(layout.coords, layout.coords[0].x + 1), 0);
    assert.equal(nearestChartIndex(layout.coords, mid + 0.1), 2);
  });
});
