import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withSplitSeriesMetrics, type OffsetPoint } from "./workoutSplits.ts";

function points(step: number, count: number, value: number): OffsetPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    offset_seconds: index * step,
    value,
  }));
}

describe("withSplitSeriesMetrics", () => {
  it("fills empty lap heart rate and cadence from series on the elapsed clock", () => {
    const splits = [
      { lap: 1, duration_seconds: 600, distance_m: 1000, avg_hr_bpm: null, avg_cadence_spm: null },
      { lap: 2, duration_seconds: 600, distance_m: 1000, avg_hr_bpm: null, avg_cadence_spm: null },
      {
        lap: 0,
        duration_seconds: 1200,
        distance_m: 2000,
        avg_hr_bpm: 153,
        avg_cadence_spm: 97,
        is_total: true,
      },
    ];
    const filled = withSplitSeriesMetrics(splits, points(10, 120, 150), points(10, 120, 96));
    assert.ok(filled);
    assert.ok(Math.abs((filled[0].avg_hr_bpm ?? 0) - 150) < 1);
    assert.ok(Math.abs((filled[1].avg_hr_bpm ?? 0) - 150) < 1);
    assert.ok(Math.abs((filled[0].avg_cadence_spm ?? 0) - 96) < 1);
    assert.equal(filled[2].avg_hr_bpm, 153);
    assert.equal(filled[2].avg_cadence_spm, 97);
  });

  it("keeps server lap values", () => {
    const splits = [
      { duration_seconds: 600, avg_hr_bpm: 140, avg_cadence_spm: 170 },
      { duration_seconds: 600, avg_hr_bpm: 160, avg_cadence_spm: 172 },
    ];
    const filled = withSplitSeriesMetrics(splits, points(10, 120, 100), points(10, 120, 100));
    assert.deepEqual(filled, splits);
  });

  it("does not smear a short series across the whole run", () => {
    const splits = [
      { duration_seconds: 4000, avg_hr_bpm: null, avg_cadence_spm: null },
      { duration_seconds: 4000, avg_hr_bpm: null, avg_cadence_spm: null },
    ];
    const heart = [
      { offset_seconds: 0, value: 120 },
      { offset_seconds: 30, value: 130 },
    ];
    const filled = withSplitSeriesMetrics(splits, heart, null);
    assert.equal(filled?.[0].avg_hr_bpm ?? null, null);
    assert.equal(filled?.[1].avg_hr_bpm ?? null, null);
  });
});
