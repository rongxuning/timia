import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCHEDULE_MAP_FAN_STEP_PX,
  SCHEDULE_MAP_REEL_STEP_PX,
  applyScheduleMapFanDrag,
  isScheduleMapFanDismissFlick,
  isScheduleMapFanTap,
  SCHEDULE_MAP_FAN_CARD_HEIGHT,
  scheduleMapFanCardOffset,
  scheduleMapFanLayout,
  scheduleMapFanSlot,
  SCHEDULE_MAP_CARD_HEIGHT,
  SCHEDULE_MAP_CARD_WIDTH,
  SCHEDULE_MAP_CARD_ZOOM_SCALE_MAX,
  SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN,
  SCHEDULE_MAP_PIN_GAP,
  SCHEDULE_MAP_PIN_SIZE,
  scheduleMapAnchorOffsets,
  scheduleMapCardZoomScale,
  scheduleMapCardZoomScaleQuantized,
  scheduleMapLatitudeDelta,
  scheduleMapReelHit,
  scheduleMapReelSide,
  scheduleMapReelSlot,
  shouldDismissReelOnEscape,
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

describe("applyScheduleMapFanDrag reel step", () => {
  it("moves one reel tile when dragged 58 px", () => {
    assert.equal(applyScheduleMapFanDrag(1, -SCHEDULE_MAP_REEL_STEP_PX, 5, SCHEDULE_MAP_REEL_STEP_PX), 2);
  });
});

describe("scheduleMapReelSlot", () => {
  it("stacks tiles vertically and hides cards beyond ±2", () => {
    assert.deepEqual(scheduleMapReelSlot(0), { scale: 1, opacity: 1, y: 0 });
    assert.equal(scheduleMapReelSlot(1)?.y, 58);
    assert.ok((scheduleMapReelSlot(1)?.scale ?? 1) < 1);
    assert.equal(scheduleMapReelSlot(2.01), null);
  });
});

describe("scheduleMapReelSide", () => {
  it("keeps the reel left unless the card is near the left edge", () => {
    assert.equal(scheduleMapReelSide(240, 400), "left");
    assert.equal(scheduleMapReelSide(40, 400), "right");
  });
});

describe("schedule map card size", () => {
  it("keeps the main card at a compact 148 by 70", () => {
    assert.equal(SCHEDULE_MAP_CARD_WIDTH, 148);
    assert.equal(SCHEDULE_MAP_CARD_HEIGHT, 70);
  });
});

describe("scheduleMapAnchorOffsets", () => {
  it("keeps the pin bottom on the geographic point and the card above the pin", () => {
    const offsets = scheduleMapAnchorOffsets();
    assert.equal(offsets.pinTop + offsets.pinSize, 0);
    assert.equal(offsets.cardTop + SCHEDULE_MAP_CARD_HEIGHT + SCHEDULE_MAP_PIN_GAP, offsets.pinTop);
    assert.equal(offsets.cardTop, -(SCHEDULE_MAP_CARD_HEIGHT + SCHEDULE_MAP_PIN_GAP + SCHEDULE_MAP_PIN_SIZE));
  });
});

describe("scheduleMapCardZoomScale", () => {
  it("grows as the visible latitude span shrinks", () => {
    const street = scheduleMapCardZoomScale(0.02);
    const district = scheduleMapCardZoomScale(0.08);
    const city = scheduleMapCardZoomScale(0.45);
    const region = scheduleMapCardZoomScale(2);
    assert.equal(street, SCHEDULE_MAP_CARD_ZOOM_SCALE_MAX);
    assert.equal(region, SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN);
    assert.ok(street > district);
    assert.ok(district > city);
    assert.ok(city > region);
    assert.equal(scheduleMapCardZoomScaleQuantized(0.02), SCHEDULE_MAP_CARD_ZOOM_SCALE_MAX);
    assert.equal(scheduleMapCardZoomScaleQuantized(2), SCHEDULE_MAP_CARD_ZOOM_SCALE_MIN);
    assert.equal(scheduleMapLatitudeDelta(40, 10), 30);
  });
});

describe("scheduleMapReelHit", () => {
  it("opens the selected card even when the event target is not the button", () => {
    assert.deepEqual(scheduleMapReelHit("open", null), { action: "open" });
  });

  it("focuses a reel tile by index", () => {
    assert.deepEqual(scheduleMapReelHit("focus", "2"), { action: "focus", index: 2 });
    assert.equal(scheduleMapReelHit("focus", "x"), null);
    assert.equal(scheduleMapReelHit(null, "2"), null);
  });
});

describe("shouldDismissReelOnEscape", () => {
  it("keeps the reel open while the task drawer is open", () => {
    assert.equal(shouldDismissReelOnEscape({ drawerOpen: true }), false);
  });

  it("dismisses the reel after the drawer is already closed", () => {
    assert.equal(shouldDismissReelOnEscape({ drawerOpen: false }), true);
  });
});
