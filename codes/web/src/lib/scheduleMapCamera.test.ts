import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_MAP_CAMERA, scheduleMapCamera } from "./scheduleMapCamera.ts";

const PUDONG = { lng: 121.5364, lat: 31.1706 };
const NEAR_PUDONG = { lng: 121.542, lat: 31.176 };
const BEIJING = { lng: 116.4074, lat: 39.9042 };
const CHENGDU = { lng: 104.0665, lat: 30.5723 };

describe("scheduleMapCamera", () => {
  it("uses China overview when there are no points", () => {
    assert.deepEqual(scheduleMapCamera([]), EMPTY_MAP_CAMERA);
  });

  it("centers on a single point and zooms to street scale", () => {
    const camera = scheduleMapCamera([PUDONG]);
    assert.equal(camera.lng, PUDONG.lng);
    assert.equal(camera.lat, PUDONG.lat);
    assert.ok(camera.zoom >= 14.5);
  });

  it("zooms in when several points sit in one neighborhood", () => {
    const camera = scheduleMapCamera([PUDONG, NEAR_PUDONG]);
    assert.ok(Math.abs(camera.lng - 121.539) < 0.01);
    assert.ok(Math.abs(camera.lat - 31.173) < 0.01);
    assert.ok(camera.zoom >= 13);
  });

  it("zooms to the dense cluster instead of the whole country", () => {
    const camera = scheduleMapCamera([PUDONG, NEAR_PUDONG, PUDONG, BEIJING]);
    assert.ok(Math.abs(camera.lng - 121.54) < 0.05);
    assert.ok(Math.abs(camera.lat - 31.17) < 0.05);
    assert.ok(camera.zoom >= 12);
  });

  it("keeps a wide view when points are spread across cities", () => {
    const camera = scheduleMapCamera([PUDONG, BEIJING, CHENGDU]);
    assert.ok(camera.zoom <= 6);
  });
});
