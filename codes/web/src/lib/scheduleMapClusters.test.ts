import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARTH_RADIUS_M,
  SCHEDULE_MAP_CLUSTER_RADIUS_M,
  clusterScheduleMapItems,
  haversineMeters,
  scheduleMapClusterFocusIndex,
  sortScheduleMapClusterItems,
} from "./scheduleMapClusters.ts";

const NOW = new Date("2026-09-22T04:00:00.000Z");
const ORIGIN = { location_lat: 31.1706, location_lng: 121.5364 };

function offsetMeters(lat: number, lng: number, northM: number, eastM: number) {
  const dLat = (northM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = (eastM / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return { location_lat: lat + dLat, location_lng: lng + dLng };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "a",
    title: "喂猫",
    location: "文汇小区",
    start_at: "2026-09-20T01:00:00.000Z",
    ...ORIGIN,
    ...overrides,
  };
}

function clustersOf(items: ReturnType<typeof item>[]) {
  return clusterScheduleMapItems(items, { now: NOW, placeFallback: "这个地点" });
}

describe("clusterScheduleMapItems", () => {
  it("keeps far coordinates as separate chests", () => {
    const clusters = clustersOf([
      item({ id: "a" }),
      item({ id: "b", location_lat: 31.18, location_lng: 121.54 }),
    ]);
    assert.equal(clusters.length, 2);
    assert.deepEqual(clusters.map((row) => row.items.map((task) => task.id)), [["a"], ["b"]]);
  });

  it("merges the same 6-decimal key", () => {
    const clusters = clustersOf([item({ id: "a" }), item({ id: "b", title: "遛狗" })]);
    assert.equal(clusters.length, 1);
    assert.deepEqual(clusters[0].items.map((task) => task.id).sort(), ["a", "b"]);
  });

  it("merges points 29.9 m apart and splits 30.1 m", () => {
    const near = offsetMeters(ORIGIN.location_lat, ORIGIN.location_lng, 0, 29.9);
    const far = offsetMeters(ORIGIN.location_lat, ORIGIN.location_lng, 0, 30.1);
    assert.ok(haversineMeters(
      { lat: ORIGIN.location_lat, lng: ORIGIN.location_lng },
      { lat: near.location_lat, lng: near.location_lng },
    ) <= SCHEDULE_MAP_CLUSTER_RADIUS_M);
    assert.ok(haversineMeters(
      { lat: ORIGIN.location_lat, lng: ORIGIN.location_lng },
      { lat: far.location_lat, lng: far.location_lng },
    ) > SCHEDULE_MAP_CLUSTER_RADIUS_M);
    assert.equal(clustersOf([item({ id: "a" }), item({ id: "b", ...near })]).length, 1);
    assert.equal(clustersOf([item({ id: "a" }), item({ id: "b", ...far })]).length, 2);
  });

  it("does not chain A-C through B when A-C is over 30 m", () => {
    const b = offsetMeters(ORIGIN.location_lat, ORIGIN.location_lng, 0, 25);
    const c = offsetMeters(b.location_lat, b.location_lng, 0, 25);
    for (const order of [
      [item({ id: "a" }), item({ id: "b", ...b }), item({ id: "c", ...c })],
      [item({ id: "b", ...b }), item({ id: "a" }), item({ id: "c", ...c })],
    ]) {
      const clusters = clustersOf(order);
      const withA = clusters.find((row) => row.items.some((task) => task.id === "a"));
      assert.equal(withA?.items.some((task) => task.id === "c"), false);
    }
  });

  it("uses the majority coordinate and place name", () => {
    const other = offsetMeters(ORIGIN.location_lat, ORIGIN.location_lng, 0, 8);
    const clusters = clustersOf([
      item({ id: "a", location: "文汇小区" }),
      item({ id: "b", location: "文汇小区" }),
      item({ id: "c", location: "另一名", ...other }),
    ]);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].location_lat, ORIGIN.location_lat);
    assert.equal(clusters[0].location_lng, ORIGIN.location_lng);
    assert.equal(clusters[0].placeTitle, "文汇小区");
  });

  it("falls back when every location is empty", () => {
    const clusters = clustersOf([
      item({ id: "a", location: "  " }),
      item({ id: "b", location: null }),
    ]);
    assert.equal(clusters[0].placeTitle, "这个地点");
  });
});

describe("sortScheduleMapClusterItems", () => {
  it("puts timed tasks first, undated last, then title and id", () => {
    const sorted = sortScheduleMapClusterItems([
      item({ id: "d", title: "未排期后", start_at: null }),
      item({ id: "c", title: "未排期前", start_at: null }),
      item({ id: "b", title: "B晚", start_at: "2026-09-20T03:00:00.000Z" }),
      item({ id: "a", title: "A早", start_at: "2026-09-20T01:00:00.000Z" }),
      item({ id: "e", title: "同时B", start_at: "2026-09-20T01:00:00.000Z" }),
      item({ id: "f", title: "同时A", start_at: "2026-09-20T01:00:00.000Z" }),
    ]);
    assert.deepEqual(sorted.map((row) => row.id), ["a", "f", "e", "b", "c", "d"]);
  });
});

describe("scheduleMapClusterFocusIndex", () => {
  it("focuses the soonest future start", () => {
    const items = sortScheduleMapClusterItems([
      item({ id: "past", start_at: "2026-09-21T01:00:00.000Z" }),
      item({ id: "soon", start_at: "2026-09-22T05:00:00.000Z" }),
      item({ id: "later", start_at: "2026-09-23T01:00:00.000Z" }),
    ]);
    assert.equal(items[scheduleMapClusterFocusIndex(items, NOW)].id, "soon");
  });

  it("falls back to the first sorted card when nothing is upcoming", () => {
    const items = sortScheduleMapClusterItems([
      item({ id: "past", start_at: "2026-09-21T01:00:00.000Z" }),
      item({ id: "undated", start_at: null }),
    ]);
    assert.equal(scheduleMapClusterFocusIndex(items, NOW), 0);
  });
});
