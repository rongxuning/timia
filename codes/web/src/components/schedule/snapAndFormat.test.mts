// 测试：拖拽 15min snap + float hour 格式化 helpers
// 跑法：node --experimental-strip-types --no-warnings src/components/schedule/snapAndFormat.test.mts

import { snapYTo15Min, formatFloatHour, SNAP_MINUTES_PX } from "./taskUtils.ts";
import { DAY_TIMELINE_HOUR_HEIGHT_PX } from "./calendarDayLayout.ts";

const HOUR_HEIGHT = 96;
const SNAP_MINUTES = 15;
const EXPECTED_SNAP_MINUTES_PX = (SNAP_MINUTES / 60) * HOUR_HEIGHT; // 24

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
  }
}

function approx(a: number, b: number, eps = 0.01) {
  return Math.abs(a - b) <= eps;
}

// ---------- constants ----------

assert(DAY_TIMELINE_HOUR_HEIGHT_PX === 96, `DAY_TIMELINE_HOUR_HEIGHT_PX=96 (got ${DAY_TIMELINE_HOUR_HEIGHT_PX})`);
assert(SNAP_MINUTES_PX === 24, `SNAP_MINUTES_PX=24 (got ${SNAP_MINUTES_PX})`);
assert(SNAP_MINUTES_PX === EXPECTED_SNAP_MINUTES_PX, `SNAP_MINUTES_PX matches 96px hour math`);

// ---------- snapYTo15Min ----------

assert(approx(snapYTo15Min(0), 0), `snapY(0)=0 (got ${snapYTo15Min(0)})`);
assert(approx(snapYTo15Min(24), 0.25), `snapY(24)=0.25 (15min)`);
assert(approx(snapYTo15Min(48), 0.5), `snapY(48)=0.5 (30min)`);
assert(approx(snapYTo15Min(72), 0.75), `snapY(72)=0.75 (45min)`);
assert(approx(snapYTo15Min(96), 1), `snapY(96)=1 (60min)`);

// round-to-nearest at half slot (12px = 7.5min → round up to 15min)
assert(approx(snapYTo15Min(12), 0.25), `snapY(12)=0.25 (JS round 0.5 → 1)`);
assert(approx(snapYTo15Min(36), 0.5), `snapY(36)=0.5 (30min)`);

// 9h block
assert(approx(snapYTo15Min(9 * HOUR_HEIGHT), 9), `snapY(9*96)=9`);
assert(approx(snapYTo15Min(9 * HOUR_HEIGHT + 24), 9.25), `snapY(9*96+24)=9.25 (9:15)`);
assert(approx(snapYTo15Min(9 * HOUR_HEIGHT + 48), 9.5), `snapY(9*96+48)=9.5 (9:30)`);
assert(approx(snapYTo15Min(9 * HOUR_HEIGHT + 72), 9.75), `snapY(9*96+72)=9.75 (9:45)`);
assert(approx(snapYTo15Min(9 * HOUR_HEIGHT + 96), 10), `snapY(9*96+96)=10`);

// boundary clamp
assert(approx(snapYTo15Min(-10), 0), `snapY(-10) clamped to 0`);
assert(approx(snapYTo15Min(HOUR_HEIGHT * 30), 24), `snapY(96*30) clamped to 24`);
assert(approx(snapYTo15Min(HOUR_HEIGHT * 24), 24), `snapY(96*24)=24 (刚好 24h)`);

// hourHeight param respected (custom scale)
assert(approx(snapYTo15Min(48, 48), 1), `snapY(48, hourHeight=48)=1`);

// ---------- formatFloatHour (unchanged) ----------

assert(formatFloatHour(0) === "00:00", `0 → 00:00 (got ${formatFloatHour(0)})`);
assert(formatFloatHour(9) === "09:00", `9 → 09:00`);
assert(formatFloatHour(23) === "23:00", `23 → 23:00`);
assert(formatFloatHour(9.25) === "09:15", `9.25 → 09:15`);
assert(formatFloatHour(9.5) === "09:30", `9.5 → 09:30`);
assert(formatFloatHour(9.75) === "09:45", `9.75 → 09:45`);
assert(formatFloatHour(23.75) === "23:45", `23.75 → 23:45`);
assert(formatFloatHour(0.25) === "00:15", `0.25 → 00:15`);
assert(formatFloatHour(10) === "10:00", `10 → 10:00`);

// ---------- integration: snapY → formatFloatHour ----------

function yToTimeStr(y: number): string {
  return formatFloatHour(snapYTo15Min(y));
}

assert(yToTimeStr(0) === "00:00", `Y=0 → 00:00`);
assert(yToTimeStr(24) === "00:15", `Y=24 → 00:15`);
assert(yToTimeStr(96) === "01:00", `Y=96 → 01:00`);
assert(yToTimeStr(9 * HOUR_HEIGHT) === "09:00", `Y=9*96 → 09:00`);
assert(yToTimeStr(9 * HOUR_HEIGHT + 48) === "09:30", `Y=9*96+48 → 09:30`);
assert(yToTimeStr(HOUR_HEIGHT * 14 + 24) === "14:15", `14:15`);
assert(yToTimeStr(HOUR_HEIGHT * 23 + 72) === "23:45", `23:45`);

// ---------- output ----------
console.log(`\n✅ passed: ${passed}`);
console.log(`❌ failed: ${failed}`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
