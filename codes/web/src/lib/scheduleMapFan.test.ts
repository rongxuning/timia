import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCHEDULE_MAP_FAN_STEP_PX,
  applyScheduleMapFanDrag,
  isScheduleMapFanDismissFlick,
  isScheduleMapFanTap,
  SCHEDULE_MAP_FAN_CARD_HEIGHT,
  scheduleMapFanCardOffset,
  scheduleMapFanLayout,
  scheduleMapFanSlot,
  snapScheduleMapFanIndex,
} from "./scheduleMapFan.ts";

describe("applyScheduleMapFanDrag", () => {
  it("moves one card when dragged 148 px left", () => {
    assert.equal(applyScheduleMapFanDrag(1, -SCHEDULE_MAP_FAN_STEP_PX, 5), 2);
  });

  it("applies 0.35 resistance past the ends", () => {
    assert.equal(applyScheduleMapFanDrag(0, SCHEDULE_MAP_FAN_STEP_PX, 3), -0.35);
    assert.equal(applyScheduleMapFanDrag(2, -SCHEDULE_MAP_FAN_STEP_PX, 3), 2.35);
  });
});

describe("snapScheduleMapFanIndex", () => {
  it("adds clamped index-space velocity then rounds", () => {
    assert.equal(snapScheduleMapFanIndex(1, -900, 5), 2);
    assert.equal(snapScheduleMapFanIndex(1, -3000, 5), 2);
    assert.equal(snapScheduleMapFanIndex(0, 900, 5), 0);
  });
});

describe("fan gestures", () => {
  it("treats a short slow press as a tap", () => {
    assert.equal(isScheduleMapFanTap(4, 3, 80), true);
    assert.equal(isScheduleMapFanTap(20, 0, 80), false);
    assert.equal(isScheduleMapFanTap(4, 0, 250), false);
  });

  it("dismisses on a downward flick", () => {
    assert.equal(isScheduleMapFanDismissFlick(100, 900), true);
    assert.equal(isScheduleMapFanDismissFlick(900, 800), false);
  });
});

describe("scheduleMapFanSlot", () => {
  it("uses the spec stops and hides cards beyond ±2", () => {
    assert.deepEqual(scheduleMapFanSlot(0), { rotate: 0, scale: 1, opacity: 1 });
    assert.deepEqual(scheduleMapFanSlot(1), { rotate: 16, scale: 0.88, opacity: 0.86 });
    assert.deepEqual(scheduleMapFanSlot(-2), { rotate: -32, scale: 0.76, opacity: 0.56 });
    assert.equal(scheduleMapFanSlot(2.01), null);
  });
});

describe("scheduleMapFanLayout", () => {
  it("opens upward when there is room, downward near the top", () => {
    assert.equal(scheduleMapFanLayout({ x: 200, y: 400 }, { width: 400, height: 600 }).direction, -1);
    assert.equal(scheduleMapFanLayout({ x: 200, y: 40 }, { width: 400, height: 600 }).direction, 1);
  });

  it("shifts inward near the side and can shrink the angle step", () => {
    const left = scheduleMapFanLayout({ x: 10, y: 400 }, { width: 400, height: 600 });
    assert.ok(left.shiftX > 0);
    assert.ok(left.shiftX <= 48);
    const tight = scheduleMapFanLayout({ x: 10, y: 400 }, { width: 80, height: 600 });
    assert.ok(tight.angleStep >= 10);
    assert.ok(tight.angleStep <= 16);
  });

  it("places a downward fan below the anchor and keeps an upward fan above it", () => {
    const down = scheduleMapFanLayout({ x: 200, y: 40 }, { width: 400, height: 600 });
    const downCenter = scheduleMapFanCardOffset(0, down);
    const downSide = scheduleMapFanCardOffset(1, down);
    assert.equal(down.direction, 1);
    assert.equal(downCenter.x, 0);
    assert.equal(downCenter.y, 0);
    assert.ok(downSide.y > downCenter.y);
    assert.ok(downSide.x > 0);

    const up = scheduleMapFanLayout({ x: 200, y: 400 }, { width: 400, height: 600 });
    const upCenter = scheduleMapFanCardOffset(0, up);
    const upSide = scheduleMapFanCardOffset(1, up);
    assert.equal(up.direction, -1);
    assert.equal(upCenter.y, -SCHEDULE_MAP_FAN_CARD_HEIGHT);
    assert.ok(upSide.y < upCenter.y);
    assert.ok(upSide.x > 0);
  });
});
