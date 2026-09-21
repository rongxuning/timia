import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wgs84ToGcj02 } from "./chinaCoordinate.ts";

describe("wgs84ToGcj02", () => {
  it("shifts Shanghai WGS-84 onto GCJ-02 used by Apple Maps / 高德 in mainland China", () => {
    const point = wgs84ToGcj02(31.1774276, 121.5272106);
    assert.ok(Math.abs(point.lat - 31.17530398364597) < 1e-8);
    assert.ok(Math.abs(point.lng - 121.531541859215) < 1e-8);
  });

  it("leaves coordinates outside mainland China unchanged", () => {
    assert.deepEqual(wgs84ToGcj02(35.6895, 139.6917), { lat: 35.6895, lng: 139.6917 });
    assert.deepEqual(wgs84ToGcj02(22.3193, 114.1694), { lat: 22.3193, lng: 114.1694 });
  });
});
