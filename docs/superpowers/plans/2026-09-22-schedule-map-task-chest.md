# Schedule Map Task Chest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Web and iOS schedule maps, collapse overlapping place tasks into one chest and open it as a swipeable poker-card fan.

**Architecture:** Keep `/views/schedule/map` unchanged. Add shared-semantics pure functions for 30 m complete-linkage clustering, sort/focus, and fan physics; Web and iOS each implement those functions. Markers stay MapLibre HTML / MapKit annotations; the open fan is a React or SwiftUI overlay anchored with `map.project` / `MapProxy.convert`.

**Tech Stack:** Next.js, TypeScript, MapLibre, node:test; SwiftUI, MapKit, XCTest. No backend, no new npm/Swift packages.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-22-schedule-map-task-chest-design.md`
- Do not change `GET /views/schedule/map` or OpenAPI
- Cluster in WGS-84 with Haversine, Earth radius `6371000` m; never use GCJ-02 for distance
- Same 6-decimal key always shares a chest; otherwise merge only if the candidate is ≤ 30 m from **every** member (complete linkage)
- Chest position = majority 6-decimal coordinate; `placeTitle` = majority non-empty `location`; empty → fallback copy
- Single-task places keep the current pin and open the existing editor
- Open fan locks map pan/zoom; one chest open at a time; no wrap-around
- Web user-visible copy goes through `next-intl` `scheduleMap.*` (zh + en). iOS stays Chinese hardcoded
- Do not add TanStack Query, Jest, or extra map SDKs
- Web unit tests: `cd codes/web && node --experimental-strip-types --test <file>`
- iOS: new files under `Timia/` and `TimiaTests/` are picked up by XcodeGen globs

## File map

| File | Responsibility |
|------|----------------|
| `codes/web/src/lib/scheduleMapClusters.ts` | Haversine, cluster, sort, focus index |
| `codes/web/src/lib/scheduleMapClusters.test.ts` | Cluster / sort / focus tests |
| `codes/web/src/lib/scheduleMapFan.ts` | Drag, snap, tap vs flick, slot, edge layout |
| `codes/web/src/lib/scheduleMapFan.test.ts` | Fan math tests |
| `codes/web/src/lib/scheduleMapPins.ts` | Chest DOM + chest copy; keep exact-key grouping |
| `codes/web/src/lib/scheduleMapPins.test.ts` | Chest copy + exact-key grouping |
| `codes/web/src/components/schedule/ScheduleMapFanOverlay.tsx` | Poker fan overlay |
| `codes/web/src/components/schedule/ScheduleMapCanvas.tsx` | Markers, lock map, mount overlay |
| `codes/web/messages/zh.json` / `en.json` | Chest / fan strings |
| `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapClusters.swift` | iOS cluster / sort / focus |
| `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFan.swift` | iOS fan math |
| `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapChestLabel.swift` | Closed chest view |
| `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFanOverlay.swift` | iOS fan overlay |
| `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapView.swift` | Wire chest + overlay; remove system dialog |
| `codes/mobile/ios/TimiaTests/ScheduleMapClustersTests.swift` | iOS cluster + fan tests |

---

### Task 1: Web cluster / sort / focus

**Files:**
- Create: `codes/web/src/lib/scheduleMapClusters.ts`
- Create: `codes/web/src/lib/scheduleMapClusters.test.ts`

**Interfaces:**
- Consumes: `groupScheduleMapItemsByCoordinate` and `scheduleMapCoordinateKey` from `codes/web/src/lib/scheduleMapPins.ts`
- Produces:
  - `EARTH_RADIUS_M = 6_371_000`
  - `SCHEDULE_MAP_CLUSTER_RADIUS_M = 30`
  - `haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number`
  - `type ScheduleMapCluster<T> = { id: string; items: T[]; location_lat: number; location_lng: number; placeTitle: string }`
  - `sortScheduleMapClusterItems<T extends { id: string; title: string; start_at?: string | null }>(items: T[]): T[]`
  - `scheduleMapClusterFocusIndex<T extends { start_at?: string | null }>(items: T[], now: Date): number`
  - `clusterScheduleMapItems<T extends { id: string; title: string; location?: string | null; location_lat: number; location_lng: number; start_at?: string | null }>(items: T[], options: { now: Date; placeFallback: string }): ScheduleMapCluster<T>[]`

- [ ] **Step 1: Write the failing tests**

Create `codes/web/src/lib/scheduleMapClusters.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd codes/web && node --experimental-strip-types --test src/lib/scheduleMapClusters.test.ts`

Expected: FAIL with `Cannot find module` / `ERR_MODULE_NOT_FOUND` for `./scheduleMapClusters.ts`

- [ ] **Step 3: Write the implementation**

Create `codes/web/src/lib/scheduleMapClusters.ts`:

```ts
import { groupScheduleMapItemsByCoordinate, scheduleMapCoordinateKey } from "./scheduleMapPins.ts";

export const EARTH_RADIUS_M = 6_371_000;
export const SCHEDULE_MAP_CLUSTER_RADIUS_M = 30;

export type ScheduleMapCluster<T> = {
  id: string;
  items: T[];
  location_lat: number;
  location_lng: number;
  placeTitle: string;
};

type Clusterable = {
  id: string;
  title: string;
  location?: string | null;
  location_lat: number;
  location_lng: number;
  start_at?: string | null;
};

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function sortScheduleMapClusterItems<T extends { id: string; title: string; start_at?: string | null }>(
  items: T[],
): T[] {
  const timed = items
    .filter((item) => item.start_at)
    .sort((left, right) => {
      const start = (left.start_at ?? "").localeCompare(right.start_at ?? "");
      if (start !== 0) return start;
      const title = left.title.localeCompare(right.title, "zh");
      if (title !== 0) return title;
      return left.id.localeCompare(right.id);
    });
  const undated = items.filter((item) => !item.start_at);
  return [...timed, ...undated];
}

export function scheduleMapClusterFocusIndex<T extends { start_at?: string | null }>(
  items: T[],
  now: Date,
): number {
  const nowMs = now.getTime();
  const upcoming = items.findIndex((item) => {
    if (!item.start_at) return false;
    return Date.parse(item.start_at) >= nowMs;
  });
  return upcoming >= 0 ? upcoming : 0;
}

function majority<T>(values: T[], keyOf: (value: T) => string): T {
  const first = new Map<string, T>();
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = keyOf(value);
    if (!first.has(key)) first.set(key, value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey = [...first.keys()][0];
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return first.get(bestKey) as T;
}

export function clusterScheduleMapItems<T extends Clusterable>(
  items: T[],
  options: { now: Date; placeFallback: string },
): ScheduleMapCluster<T>[] {
  const buckets = groupScheduleMapItemsByCoordinate(items);
  const clusters: Array<{ origin: { lat: number; lng: number }; items: T[] }> = [];

  for (const bucket of buckets) {
    const origin = { lat: bucket[0].location_lat, lng: bucket[0].location_lng };
    let target = -1;
    let targetDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < clusters.length; index += 1) {
      const fits = clusters[index].items.every(
        (member) =>
          haversineMeters(origin, { lat: member.location_lat, lng: member.location_lng }) <=
          SCHEDULE_MAP_CLUSTER_RADIUS_M,
      );
      if (!fits) continue;
      const distance = haversineMeters(origin, clusters[index].origin);
      if (distance < targetDistance) {
        target = index;
        targetDistance = distance;
      }
    }
    if (target >= 0) clusters[target].items.push(...bucket);
    else clusters.push({ origin, items: [...bucket] });
  }

  return clusters.map((cluster) => {
    const itemsSorted = sortScheduleMapClusterItems(cluster.items);
    const anchor = majority(itemsSorted, (item) =>
      scheduleMapCoordinateKey(item.location_lat, item.location_lng),
    );
    const named = itemsSorted
      .map((item) => (item.location ?? "").trim())
      .filter((name) => name.length > 0)
      .map((name) => ({ name }));
    const placeTitle = named.length
      ? majority(named, (row) => row.name).name
      : options.placeFallback;
    return {
      id: scheduleMapCoordinateKey(cluster.origin.lat, cluster.origin.lng),
      items: itemsSorted,
      location_lat: anchor.location_lat,
      location_lng: anchor.location_lng,
      placeTitle,
    };
  });
}
```

`options.now` is accepted so callers can pass the open-clock later; clustering itself does not use it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd codes/web && node --experimental-strip-types --test src/lib/scheduleMapClusters.test.ts`

Expected: PASS, all tests ok

- [ ] **Step 5: Commit**

```bash
git add codes/web/src/lib/scheduleMapClusters.ts codes/web/src/lib/scheduleMapClusters.test.ts
git commit -m "feat(web): cluster nearby schedule map tasks into chests"
```

---

### Task 2: Web fan physics

**Files:**
- Create: `codes/web/src/lib/scheduleMapFan.ts`
- Create: `codes/web/src/lib/scheduleMapFan.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1
- Produces:
  - `SCHEDULE_MAP_FAN_STEP_PX = 148`
  - `SCHEDULE_MAP_FAN_VELOCITY_DIVISOR = 900`
  - `SCHEDULE_MAP_FAN_VELOCITY_CLAMP = 1.25`
  - `SCHEDULE_MAP_FAN_EDGE_RESISTANCE = 0.35`
  - `SCHEDULE_MAP_FAN_TAP_SLOP = 8`
  - `SCHEDULE_MAP_FAN_TAP_SPEED = 200`
  - `SCHEDULE_MAP_FAN_FLICK_DOWN = 800`
  - `SCHEDULE_MAP_FAN_RADIUS = 168`
  - `SCHEDULE_MAP_FAN_ANGLE_STEP_DEG = 16`
  - `SCHEDULE_MAP_FAN_MIN_ANGLE_STEP_DEG = 10`
  - `SCHEDULE_MAP_FAN_MAX_SHIFT = 48`
  - `SCHEDULE_MAP_FAN_CARD_HEIGHT = 88`
  - `SCHEDULE_MAP_FAN_TOP_PAD = 24`
  - `applyScheduleMapFanDrag(index: number, dx: number, count: number): number`
  - `snapScheduleMapFanIndex(index: number, vx: number, count: number): number`
  - `isScheduleMapFanTap(dx: number, dy: number, speed: number): boolean`
  - `isScheduleMapFanDismissFlick(vx: number, vy: number): boolean`
  - `scheduleMapFanSlot(offset: number): { rotate: number; scale: number; opacity: number } | null`
  - `scheduleMapFanLayout(origin: { x: number; y: number }, canvas: { width: number; height: number }): { direction: 1 | -1; shiftX: number; angleStep: number }`

Pointer convention: `dx` / `vx` are screen-space, positive = finger moved right. Dragging left (`dx < 0`) increases index.

- [ ] **Step 1: Write the failing tests**

Create `codes/web/src/lib/scheduleMapFan.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SCHEDULE_MAP_FAN_STEP_PX,
  applyScheduleMapFanDrag,
  isScheduleMapFanDismissFlick,
  isScheduleMapFanTap,
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd codes/web && node --experimental-strip-types --test src/lib/scheduleMapFan.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `./scheduleMapFan.ts`

- [ ] **Step 3: Write the implementation**

Create `codes/web/src/lib/scheduleMapFan.ts`:

```ts
export const SCHEDULE_MAP_FAN_STEP_PX = 148;
export const SCHEDULE_MAP_FAN_VELOCITY_DIVISOR = 900;
export const SCHEDULE_MAP_FAN_VELOCITY_CLAMP = 1.25;
export const SCHEDULE_MAP_FAN_EDGE_RESISTANCE = 0.35;
export const SCHEDULE_MAP_FAN_TAP_SLOP = 8;
export const SCHEDULE_MAP_FAN_TAP_SPEED = 200;
export const SCHEDULE_MAP_FAN_FLICK_DOWN = 800;
export const SCHEDULE_MAP_FAN_RADIUS = 168;
export const SCHEDULE_MAP_FAN_ANGLE_STEP_DEG = 16;
export const SCHEDULE_MAP_FAN_MIN_ANGLE_STEP_DEG = 10;
export const SCHEDULE_MAP_FAN_MAX_SHIFT = 48;
export const SCHEDULE_MAP_FAN_CARD_HEIGHT = 88;
export const SCHEDULE_MAP_FAN_TOP_PAD = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyScheduleMapFanDrag(index: number, dx: number, count: number): number {
  const raw = index - dx / SCHEDULE_MAP_FAN_STEP_PX;
  const max = Math.max(0, count - 1);
  if (raw < 0) return raw * SCHEDULE_MAP_FAN_EDGE_RESISTANCE;
  if (raw > max) return max + (raw - max) * SCHEDULE_MAP_FAN_EDGE_RESISTANCE;
  return raw;
}

export function snapScheduleMapFanIndex(index: number, vx: number, count: number): number {
  const velocity = clamp(
    -vx / SCHEDULE_MAP_FAN_VELOCITY_DIVISOR,
    -SCHEDULE_MAP_FAN_VELOCITY_CLAMP,
    SCHEDULE_MAP_FAN_VELOCITY_CLAMP,
  );
  return clamp(Math.round(index + velocity), 0, Math.max(0, count - 1));
}

export function isScheduleMapFanTap(dx: number, dy: number, speed: number): boolean {
  return Math.hypot(dx, dy) < SCHEDULE_MAP_FAN_TAP_SLOP && speed < SCHEDULE_MAP_FAN_TAP_SPEED;
}

export function isScheduleMapFanDismissFlick(vx: number, vy: number): boolean {
  return vy > SCHEDULE_MAP_FAN_FLICK_DOWN && Math.abs(vy) > Math.abs(vx);
}

export function scheduleMapFanSlot(
  offset: number,
): { rotate: number; scale: number; opacity: number } | null {
  const abs = Math.abs(offset);
  if (abs > 2) return null;
  const scale = abs <= 1 ? 1 - 0.12 * abs : 0.88 - 0.12 * (abs - 1);
  const opacity = abs <= 1 ? 1 - 0.14 * abs : 0.86 - 0.3 * (abs - 1);
  return { rotate: offset * SCHEDULE_MAP_FAN_ANGLE_STEP_DEG, scale, opacity };
}

export function scheduleMapFanLayout(
  origin: { x: number; y: number },
  canvas: { width: number; height: number },
): { direction: 1 | -1; shiftX: number; angleStep: number } {
  const needed = SCHEDULE_MAP_FAN_RADIUS + SCHEDULE_MAP_FAN_CARD_HEIGHT + SCHEDULE_MAP_FAN_TOP_PAD;
  const direction: 1 | -1 = origin.y >= needed ? -1 : 1;
  const half = 2 * SCHEDULE_MAP_FAN_RADIUS * Math.sin((SCHEDULE_MAP_FAN_ANGLE_STEP_DEG * Math.PI) / 180);
  let shiftX = 0;
  if (origin.x - half < 0) shiftX = Math.min(SCHEDULE_MAP_FAN_MAX_SHIFT, half - origin.x);
  if (origin.x + half > canvas.width) {
    shiftX = Math.max(-SCHEDULE_MAP_FAN_MAX_SHIFT, canvas.width - origin.x - half);
  }
  const stillOverflows =
    origin.x + shiftX - half < 0 || origin.x + shiftX + half > canvas.width;
  const angleStep = stillOverflows ? SCHEDULE_MAP_FAN_MIN_ANGLE_STEP_DEG : SCHEDULE_MAP_FAN_ANGLE_STEP_DEG;
  return { direction, shiftX, angleStep };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd codes/web && node --experimental-strip-types --test src/lib/scheduleMapFan.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codes/web/src/lib/scheduleMapFan.ts codes/web/src/lib/scheduleMapFan.test.ts
git commit -m "feat(web): add schedule map poker-fan physics"
```

---

### Task 3: Web chest copy + i18n

**Files:**
- Modify: `codes/web/messages/zh.json` (`scheduleMap` block)
- Modify: `codes/web/messages/en.json` (`scheduleMap` block)
- Modify: `codes/web/src/lib/scheduleMapPins.ts`
- Modify: `codes/web/src/lib/scheduleMapPins.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - i18n keys `chestTasks`, `chestAria`, `chestPlaceFallback`, `fanPosition`, `fanAria` under `scheduleMap`
  - `scheduleMapChestCopy(cluster, labels) → { placeTitle, countDisplay, countLabel, ariaLabel }`
  - `createScheduleMapChestElement(copy) → HTMLButtonElement`

- [ ] **Step 1: Write the failing chest-copy test**

Add to `codes/web/src/lib/scheduleMapPins.test.ts`:

```ts
import { scheduleMapChestCopy } from "./scheduleMapPins.ts";

const CHEST_LABELS = {
  chestTasks: (count: number) => `${count} 个任务`,
  chestAria: (place: string, count: number) => `${place}，${count} 个任务，点按查看`,
};

describe("scheduleMapChestCopy", () => {
  it("uses the place title and caps the badge at 99+", () => {
    const copy = scheduleMapChestCopy({ placeTitle: "文汇小区", count: 3 }, CHEST_LABELS);
    assert.equal(copy.placeTitle, "文汇小区");
    assert.equal(copy.countDisplay, "3");
    assert.equal(copy.countLabel, "3 个任务");
    assert.equal(copy.ariaLabel, "文汇小区，3 个任务，点按查看");
    assert.equal(
      scheduleMapChestCopy({ placeTitle: "文汇小区", count: 120 }, CHEST_LABELS).countDisplay,
      "99+",
    );
  });
});
```

Leave the existing `moreItems` / `scheduleMapCardCopy` tests; single-task pins still use `scheduleMapCardCopy`.

- [ ] **Step 2: Run the pin tests to verify the new case fails**

Run: `cd codes/web && node --experimental-strip-types --test src/lib/scheduleMapPins.test.ts`

Expected: FAIL, `scheduleMapChestCopy` is not exported

- [ ] **Step 3: Add i18n keys and chest helpers**

In both `codes/web/messages/zh.json` and `codes/web/messages/en.json`, add these keys next to `pinAria` inside `scheduleMap`:

zh:

```json
"chestTasks": "{count} 个任务",
"chestAria": "{place}，{count} 个任务，点按查看",
"chestPlaceFallback": "这个地点",
"fanPosition": "{current} / {total}",
"fanAria": "第 {current} 张，共 {total} 张，{title}，{time}，{status}"
```

en:

```json
"chestTasks": "{count} tasks",
"chestAria": "{place}, {count} tasks, double tap to open",
"chestPlaceFallback": "This place",
"fanPosition": "{current} / {total}",
"fanAria": "Card {current} of {total}, {title}, {time}, {status}"
```

Append to `codes/web/src/lib/scheduleMapPins.ts`:

```ts
export type ScheduleMapChestLabels = {
  chestTasks: (count: number) => string;
  chestAria: (place: string, count: number) => string;
};

export type ScheduleMapChestCopy = {
  placeTitle: string;
  countDisplay: string;
  countLabel: string;
  ariaLabel: string;
};

export function scheduleMapChestCopy(
  cluster: { placeTitle: string; count: number },
  labels: ScheduleMapChestLabels,
): ScheduleMapChestCopy {
  const countDisplay = cluster.count > 99 ? "99+" : String(cluster.count);
  return {
    placeTitle: cluster.placeTitle,
    countDisplay,
    countLabel: labels.chestTasks(cluster.count),
    ariaLabel: labels.chestAria(cluster.placeTitle, cluster.count),
  };
}

export function createScheduleMapChestElement(
  copy: ScheduleMapChestCopy,
): HTMLButtonElement {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "schedule-map-chest flex flex-col items-center";
  root.setAttribute("aria-label", copy.ariaLabel);
  root.setAttribute("aria-expanded", "false");
  root.style.cssText =
    "border:0;background:transparent;padding:0;cursor:pointer;filter:drop-shadow(0 8px 16px rgb(15 23 42 / 0.12));";

  const stack = document.createElement("div");
  stack.style.cssText = "position:relative;width:min(220px,70vw);";

  for (const layer of [2, 1]) {
    const back = document.createElement("div");
    back.setAttribute("aria-hidden", "true");
    back.style.cssText = [
      "position:absolute",
      "inset:0",
      `transform:translate(${layer * 4}px,${-layer * 4}px)`,
      "border-radius:12px",
      "border:1px solid var(--color-border-subtle, #e4e4e7)",
      "background:#fff",
    ].join(";");
    stack.append(back);
  }

  const card = document.createElement("div");
  card.className = "relative rounded-xl border border-border-subtle bg-surface px-3 py-2 text-left";
  const titleRow = document.createElement("div");
  titleRow.className = "flex items-center gap-2";
  const title = document.createElement("div");
  title.className = "min-w-0 flex-1 truncate text-small font-semibold text-text-primary";
  title.textContent = copy.placeTitle;
  const badge = document.createElement("span");
  badge.className =
    "rounded-full bg-primary/10 px-1.5 text-caption font-semibold text-primary";
  badge.textContent = copy.countDisplay;
  titleRow.append(title, badge);
  const subtitle = document.createElement("div");
  subtitle.className = "mt-0.5 truncate text-caption text-text-secondary";
  subtitle.textContent = copy.countLabel;
  card.append(titleRow, subtitle);
  stack.append(card);

  const pin = document.createElement("span");
  pin.setAttribute("aria-hidden", "true");
  pin.style.cssText = [
    "display:block",
    "width:14px",
    "height:14px",
    "margin-top:4px",
    "border-radius:999px",
    "background:var(--color-primary, #4f46e5)",
    "border:2px solid #fff",
    "box-shadow:0 1px 3px rgb(15 23 42 / 0.28)",
  ].join(";");

  root.append(stack, pin);
  return root;
}
```

- [ ] **Step 4: Run pin tests and i18n check**

Run:

```bash
cd codes/web && node --experimental-strip-types --test src/lib/scheduleMapPins.test.ts
cd codes/web && npm run test:i18n
```

Expected: both PASS. If `test:i18n` fails, the missing key is in only one locale — add the same key to the other file.

- [ ] **Step 5: Commit**

```bash
git add codes/web/messages/zh.json codes/web/messages/en.json \
  codes/web/src/lib/scheduleMapPins.ts codes/web/src/lib/scheduleMapPins.test.ts
git commit -m "feat(web): add schedule map chest copy and i18n"
```

---

### Task 4: Web canvas + poker fan overlay

**Files:**
- Create: `codes/web/src/components/schedule/ScheduleMapFanOverlay.tsx`
- Modify: `codes/web/src/components/schedule/ScheduleMapCanvas.tsx`

**Interfaces:**
- Consumes:
  - `clusterScheduleMapItems`, `scheduleMapClusterFocusIndex` from Task 1
  - fan functions and constants from Task 2
  - `createScheduleMapChestElement`, `scheduleMapChestCopy`, `createScheduleMapPinElement`, `scheduleMapCardCopy` from Task 3 / existing pins
- Produces: map markers are single pins or chests; opening a chest renders `ScheduleMapFanOverlay`; choosing the center card calls existing `onItemClick`

- [ ] **Step 1: Add the overlay component**

Create `codes/web/src/components/schedule/ScheduleMapFanOverlay.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import {
  desaturateHex,
  formatScheduleTimeRange,
  isSettledCalendarStatus,
  taskCalendarColors,
} from "@/components/schedule/taskUtils";
import { scheduleMapPinColor, type ScheduleMapItem } from "@/lib/scheduleMapGeo";
import type { ScheduleMapCluster } from "@/lib/scheduleMapClusters";
import {
  SCHEDULE_MAP_FAN_CARD_HEIGHT,
  SCHEDULE_MAP_FAN_RADIUS,
  applyScheduleMapFanDrag,
  isScheduleMapFanDismissFlick,
  isScheduleMapFanTap,
  scheduleMapFanLayout,
  scheduleMapFanSlot,
  snapScheduleMapFanIndex,
} from "@/lib/scheduleMapFan";

type ScheduleMapFanOverlayProps = {
  cluster: ScheduleMapCluster<ScheduleMapItem>;
  index: number;
  origin: { x: number; y: number };
  canvas: { width: number; height: number };
  positionLabel: string;
  unscheduled: string;
  statusLabel: (status: string) => string;
  fanAria: (current: number, total: number, title: string, time: string, status: string) => string;
  onIndexChange: (index: number) => void;
  onSelect: (item: ScheduleMapItem) => void;
  onDismiss: () => void;
};

export function ScheduleMapFanOverlay({
  cluster,
  index,
  origin,
  canvas,
  positionLabel,
  unscheduled,
  statusLabel,
  fanAria,
  onIndexChange,
  onSelect,
  onDismiss,
}: ScheduleMapFanOverlayProps) {
  const dragRef = useRef<{ x: number; y: number; t: number; index: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const layout = scheduleMapFanLayout(origin, canvas);
  const center = Math.round(index);

  useEffect(() => {
    rootRef.current?.focus();
  }, [cluster.id]);

  function endPointer(event: PointerEvent | React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const dt = Math.max(1, event.timeStamp - drag.t);
    const vx = (dx / dt) * 1000;
    const vy = (dy / dt) * 1000;
    if (isScheduleMapFanDismissFlick(vx, vy)) {
      onDismiss();
      return;
    }
    if (isScheduleMapFanTap(dx, dy, Math.hypot(vx, vy))) {
      const target = event.target;
      const button = target instanceof HTMLElement ? target.closest("[data-fan-index]") : null;
      const tapped = Number(button?.getAttribute("data-fan-index"));
      if (Number.isInteger(tapped) && tapped === center) {
        onSelect(cluster.items[center]);
        return;
      }
      if (Number.isInteger(tapped)) {
        onIndexChange(tapped);
        return;
      }
    }
    onIndexChange(snapScheduleMapFanIndex(applyScheduleMapFanDrag(drag.index, dx, cluster.items.length), vx, cluster.items.length));
  }

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="dialog"
      aria-modal="true"
      className="pointer-events-auto absolute inset-0 z-20 outline-none"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss();
          return;
        }
        dragRef.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, index };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        onIndexChange(applyScheduleMapFanDrag(drag.index, event.clientX - drag.x, cluster.items.length));
      }}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
        if (event.key === "ArrowLeft") onIndexChange(Math.max(0, center - 1));
        if (event.key === "ArrowRight") onIndexChange(Math.min(cluster.items.length - 1, center + 1));
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(cluster.items[center]);
        }
      }}
    >
      <div
        className="pointer-events-auto absolute"
        style={{ left: origin.x + layout.shiftX, top: origin.y }}
      >
        <div className="-translate-x-1/2 -translate-y-full pb-2 text-center text-caption text-text-secondary">
          {positionLabel}
        </div>
        {cluster.items.map((item, itemIndex) => {
          const slot = scheduleMapFanSlot(itemIndex - index);
          if (!slot) return null;
          const colors = taskCalendarColors(item.priority);
          const background = isSettledCalendarStatus(item.status)
            ? desaturateHex(colors.bg)
            : colors.bg;
          const time = formatScheduleTimeRange(item.start_at, item.end_at) ?? unscheduled;
          const status = statusLabel(item.status);
          const angle = ((itemIndex - index) * layout.angleStep * Math.PI) / 180;
          const x = Math.sin(angle) * SCHEDULE_MAP_FAN_RADIUS;
          const y = layout.direction * (1 - Math.cos(angle)) * SCHEDULE_MAP_FAN_RADIUS;
          return (
            <button
              key={item.id}
              type="button"
              data-fan-index={itemIndex}
              aria-label={fanAria(itemIndex + 1, cluster.items.length, item.title, time, status)}
              className="absolute w-[200px] -translate-x-1/2 rounded-xl border px-3 py-2 text-left shadow-sm"
              style={{
                left: x,
                top: y - SCHEDULE_MAP_FAN_CARD_HEIGHT,
                transform: `translate(-50%, 0) rotate(${slot.rotate * layout.direction}deg) scale(${slot.scale})`,
                opacity: slot.opacity,
                zIndex: 20 - Math.round(Math.abs(itemIndex - index) * 10),
                background,
                color: colors.fg,
                borderColor: scheduleMapPinColor(item),
                borderLeftWidth: 3,
              }}
            >
              <div className="truncate text-small font-semibold">{item.title}</div>
              <div className="mt-0.5 truncate text-caption" style={{ opacity: 0.82 }}>{time}</div>
              <div className="truncate text-caption" style={{ opacity: 0.82 }}>{status}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace stacked pins and the popup list in the canvas**

In `codes/web/src/components/schedule/ScheduleMapCanvas.tsx`:

1. Import `clusterScheduleMapItems`, `scheduleMapClusterFocusIndex`, `ScheduleMapCluster`, chest helpers, and `ScheduleMapFanOverlay`.
2. Add React state:

```ts
const [openClusterId, setOpenClusterId] = useState<string | null>(null);
const [fanIndex, setFanIndex] = useState(0);
const [fanOrigin, setFanOrigin] = useState<{ x: number; y: number } | null>(null);
const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
```

3. Compute `clusters` with `useMemo` from `items` and `t("chestPlaceFallback")`.
4. Delete `popupRef`, `renderList`, and the `maplibregl.Popup` setup.
5. In `syncMarkers`, iterate `clusterScheduleMapItems(next, { now: new Date(), placeFallback })`:
   - `cluster.items.length === 1`: existing `createScheduleMapPinElement` + `scheduleMapCardCopy`; click calls `onItemClickRef.current(cluster.items[0])`
   - else: `createScheduleMapChestElement(scheduleMapChestCopy({ placeTitle: cluster.placeTitle, count: cluster.items.length }, chestLabels))`; click sets `openClusterId` to `cluster.id` and `fanIndex` to `scheduleMapClusterFocusIndex(cluster.items, new Date())`. Set `el.dataset.clusterId = cluster.id` and `el.setAttribute("aria-expanded", open ? "true" : "false")`.
   - Marker `setLngLat([cluster.location_lng, cluster.location_lat])`
6. After markers sync, if a cluster is open, `project` that coordinate into `fanOrigin` and store canvas size. On `move` / `resize`, re-project.
7. When `openClusterId` is set, disable `map.dragPan`, `map.scrollZoom`, `map.touchZoomRotate`; enable them again when it clears.
8. Render `ScheduleMapFanOverlay` when `openCluster` and `fanOrigin` exist. `onSelect` closes the fan then calls `onItemClick(item)`. `onDismiss` clears `openClusterId`.
9. When `items` change: if the open cluster’s item-id set changed, clear `openClusterId` immediately; if the set is unchanged, keep `fanIndex` and clamp it to `count - 1`.

Pointer-events: the overlay’s full-screen layer handles blank-map dismiss. Chests stay clickable underneath only after dismiss — while open, the overlay sits above the map (`z-20`) so another chest cannot be hit until the current fan closes. To open another chest, dismiss first (blank tap or chest is covered). Spec allows “tap other chest after close animation”; implement that as: overlay click-outside closes; a second tap on the other chest opens it. Do **not** keep the old popup list.

- [ ] **Step 3: Run the related unit tests**

Run:

```bash
cd codes/web && node --experimental-strip-types --test src/lib/scheduleMapClusters.test.ts src/lib/scheduleMapFan.test.ts src/lib/scheduleMapPins.test.ts
cd codes/web && npm run test:i18n
```

Expected: PASS. There is no RTL harness; overlay wiring is verified by reading the canvas: no `Popup`, no `renderList`, chests for `count >= 2`.

- [ ] **Step 4: Typecheck the web overlay**

Run: `cd codes/web && npx tsc --noEmit --pretty false`

Expected: no errors in `ScheduleMapCanvas.tsx` or `ScheduleMapFanOverlay.tsx`. Then open `/my/schedule` map mode: two tasks at the same place show one chest; swipe the fan; the center card opens the existing drawer; a blank tap closes it; the map does not pan while open.

- [ ] **Step 5: Commit**

```bash
git add codes/web/src/components/schedule/ScheduleMapFanOverlay.tsx \
  codes/web/src/components/schedule/ScheduleMapCanvas.tsx
git commit -m "feat(web): open overlapping map tasks as a poker fan"
```

---

### Task 5: iOS cluster + fan math

**Files:**
- Create: `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapClusters.swift`
- Create: `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFan.swift`
- Create: `codes/mobile/ios/TimiaTests/ScheduleMapClustersTests.swift`

**Interfaces:**
- Consumes: existing `groupScheduleMapItemsByCoordinate` and `scheduleMapCoordinateKey` in `ScheduleMapFilters.swift`
- Produces the same numbers and rules as the Web functions:
  - `earthRadiusM = 6_371_000`
  - `scheduleMapClusterRadiusM = 30`
  - `haversineMeters`
  - `struct ScheduleMapTaskCluster: Identifiable, Equatable`
  - `sortScheduleMapClusterItems`
  - `scheduleMapClusterFocusIndex(items:now:)`
  - `clusterScheduleMapItems(_:now:placeFallback:)`
  - fan constants and `applyScheduleMapFanDrag`, `snapScheduleMapFanIndex`, `isScheduleMapFanTap`, `isScheduleMapFanDismissFlick`, `scheduleMapFanSlot`, `scheduleMapFanLayout`

- [ ] **Step 1: Write failing XCTest cases**

Create `codes/mobile/ios/TimiaTests/ScheduleMapClustersTests.swift`:

```swift
import XCTest
@testable import Timia

final class ScheduleMapClustersTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-09-22T04:00:00Z")!

    func testMergesSameCoordinateAndSplitsFarOnes() {
        let a = mapItem(id: "a", lat: 31.1706, lng: 121.5364)
        let same = mapItem(id: "b", lat: 31.1706, lng: 121.5364)
        let far = mapItem(id: "c", lat: 31.18, lng: 121.54)
        XCTAssertEqual(clusterScheduleMapItems([a, same, far], now: now, placeFallback: "这个地点").count, 2)
    }

    func testMerges29_9mAndSplits30_1m() {
        let origin = mapItem(id: "a", lat: 31.1706, lng: 121.5364)
        let near = offset(origin, id: "b", east: 29.9)
        let far = offset(origin, id: "b", east: 30.1)
        XCTAssertEqual(clusterScheduleMapItems([origin, near], now: now, placeFallback: "这个地点").count, 1)
        XCTAssertEqual(clusterScheduleMapItems([origin, far], now: now, placeFallback: "这个地点").count, 2)
    }

    func testDoesNotChainACThroughB() {
        let a = mapItem(id: "a", lat: 31.1706, lng: 121.5364)
        let b = offset(a, id: "b", east: 25)
        let c = offset(b, id: "c", east: 25)
        for order in [[a, b, c], [b, a, c]] {
            let clusters = clusterScheduleMapItems(order, now: now, placeFallback: "这个地点")
            let withA = clusters.first { $0.items.contains(where: { $0.id == "a" }) }
            XCTAssertFalse(withA?.items.contains(where: { $0.id == "c" }) ?? true)
        }
    }

    func testSortAndFocusMatchWeb() {
        let past = mapItem(id: "past", lat: 31.17, lng: 121.53, startAt: "2026-09-21T01:00:00.000Z")
        let soon = mapItem(id: "soon", lat: 31.17, lng: 121.53, startAt: "2026-09-22T05:00:00.000Z")
        let later = mapItem(id: "later", lat: 31.17, lng: 121.53, startAt: "2026-09-23T01:00:00.000Z")
        let sorted = sortScheduleMapClusterItems([later, past, soon])
        XCTAssertEqual(sorted.map(\.id), ["past", "soon", "later"])
        XCTAssertEqual(sorted[scheduleMapClusterFocusIndex(sorted, now: now)].id, "soon")
    }

    func testFanDragSnapAndTap() {
        XCTAssertEqual(applyScheduleMapFanDrag(index: 1, dx: -148, count: 5), 2, accuracy: 0.0001)
        XCTAssertEqual(applyScheduleMapFanDrag(index: 0, dx: 148, count: 3), -0.35, accuracy: 0.0001)
        XCTAssertEqual(snapScheduleMapFanIndex(index: 1, vx: -900, count: 5), 2)
        XCTAssertTrue(isScheduleMapFanTap(dx: 4, dy: 3, speed: 80))
        XCTAssertTrue(isScheduleMapFanDismissFlick(vx: 100, vy: 900))
        XCTAssertEqual(scheduleMapFanSlot(offset: 1)?.rotate ?? 0, 16, accuracy: 0.001)
        XCTAssertNil(scheduleMapFanSlot(offset: 2.01))
        XCTAssertEqual(scheduleMapFanLayout(origin: CGPoint(x: 200, y: 400), canvas: CGSize(width: 400, height: 600)).direction, -1)
    }

    private func offset(_ item: ScheduleMapItem, id: String, east: Double) -> ScheduleMapItem {
        let dLng = (east / (earthRadiusM * cos(item.locationLat * .pi / 180))) * (180 / .pi)
        return mapItem(id: id, lat: item.locationLat, lng: item.locationLng + dLng, startAt: item.startAt)
    }

    private func mapItem(id: String, lat: Double, lng: Double, startAt: String? = nil) -> ScheduleMapItem {
        ScheduleMapItem(
            id: id, title: id, body: nil, color: "#FFFFFF", status: "todo", priority: "1",
            startAt: startAt, endAt: nil, completedAt: nil, details: nil, version: 1,
            createdBy: nil, assignee: nil, participants: nil, location: "文汇小区",
            locationLat: lat, locationLng: lng, workspaceId: "ws", workspaceName: "空间",
            projectId: "p", projectName: "项目"
        )
    }
}
```

- [ ] **Step 2: Generate the project and run the new tests — expect FAIL**

Run:

```bash
cd codes/mobile/ios
xcodegen generate
xcodebuild -project Timia.xcodeproj -scheme Timia \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/timia-ios-derived CODE_SIGNING_ALLOWED=NO \
  -only-testing:TimiaTests/ScheduleMapClustersTests test
```

Expected: FAIL, `clusterScheduleMapItems` / fan helpers are missing

If this environment cannot run `xcodebuild test`, compile-check with the README build command and keep the tests red in the source until the symbols exist.

- [ ] **Step 3: Implement the Swift functions**

In `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFilters.swift`, change `private func scheduleMapParseISO` to `func scheduleMapParseISO` (internal) so clustering can reuse it. Delete any new parser.

Create `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapClusters.swift`:

```swift
import Foundation

let earthRadiusM = 6_371_000.0
let scheduleMapClusterRadiusM = 30.0

struct ScheduleMapTaskCluster: Identifiable, Equatable {
    let id: String
    let items: [ScheduleMapItem]
    let locationLat: Double
    let locationLng: Double
    let placeTitle: String
}

func haversineMeters(lat1: Double, lng1: Double, lat2: Double, lng2: Double) -> Double {
    let dLat = (lat2 - lat1) * .pi / 180
    let dLng = (lng2 - lng1) * .pi / 180
    let a = sin(dLat / 2) * sin(dLat / 2)
        + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180) * sin(dLng / 2) * sin(dLng / 2)
    return 2 * earthRadiusM * asin(min(1, sqrt(a)))
}

func sortScheduleMapClusterItems(_ items: [ScheduleMapItem]) -> [ScheduleMapItem] {
    let timed = items.filter { $0.startAt != nil }.sorted {
        if $0.startAt != $1.startAt { return ($0.startAt ?? "") < ($1.startAt ?? "") }
        if $0.title != $1.title { return $0.title.localizedStandardCompare($1.title) == .orderedAscending }
        return $0.id < $1.id
    }
    return timed + items.filter { $0.startAt == nil }
}

func scheduleMapClusterFocusIndex(_ items: [ScheduleMapItem], now: Date) -> Int {
    items.firstIndex { item in
        guard let date = scheduleMapParseISO(item.startAt) else { return false }
        return date >= now
    } ?? 0
}

func clusterScheduleMapItems(
    _ items: [ScheduleMapItem],
    now _: Date,
    placeFallback: String
) -> [ScheduleMapTaskCluster] {
    let buckets = groupScheduleMapItemsByCoordinate(items)
    var clusters: [(origin: (lat: Double, lng: Double), items: [ScheduleMapItem])] = []
    for bucket in buckets {
        guard let first = bucket.first else { continue }
        let origin = (lat: first.locationLat, lng: first.locationLng)
        var target: Int?
        var best = Double.greatestFiniteMagnitude
        for (index, cluster) in clusters.enumerated() {
            let fits = cluster.items.allSatisfy {
                haversineMeters(lat1: origin.lat, lng1: origin.lng, lat2: $0.locationLat, lng2: $0.locationLng)
                    <= scheduleMapClusterRadiusM
            }
            guard fits else { continue }
            let distance = haversineMeters(lat1: origin.lat, lng1: origin.lng, lat2: cluster.origin.lat, lng2: cluster.origin.lng)
            if distance < best {
                best = distance
                target = index
            }
        }
        if let target {
            clusters[target].items.append(contentsOf: bucket)
        } else {
            clusters.append((origin, bucket))
        }
    }
    return clusters.map { cluster in
        let sorted = sortScheduleMapClusterItems(cluster.items)
        let coord = majority(sorted) { scheduleMapCoordinateKey(lat: $0.locationLat, lng: $0.locationLng) }
        let names = sorted.compactMap { $0.location?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        let placeTitle = names.isEmpty ? placeFallback : majority(names) { $0 }
        return ScheduleMapTaskCluster(
            id: scheduleMapCoordinateKey(lat: cluster.origin.lat, lng: cluster.origin.lng),
            items: sorted,
            locationLat: coord.locationLat,
            locationLng: coord.locationLng,
            placeTitle: placeTitle
        )
    }
}

private func majority<T>(_ values: [T], key: (T) -> String) -> T {
    var first: [String: T] = [:]
    var counts: [String: Int] = [:]
    for value in values {
        let k = key(value)
        if first[k] == nil { first[k] = value }
        counts[k, default: 0] += 1
    }
    let best = counts.max { $0.value < $1.value }?.key
    return first[best ?? ""]!
}
```

Create `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFan.swift`:

```swift
import CoreGraphics
import Foundation

let scheduleMapFanStepPx = 148.0
let scheduleMapFanVelocityDivisor = 900.0
let scheduleMapFanVelocityClamp = 1.25
let scheduleMapFanEdgeResistance = 0.35
let scheduleMapFanTapSlop = 8.0
let scheduleMapFanTapSpeed = 200.0
let scheduleMapFanFlickDown = 800.0
let scheduleMapFanRadius = 168.0
let scheduleMapFanAngleStepDeg = 16.0
let scheduleMapFanMinAngleStepDeg = 10.0
let scheduleMapFanMaxShift = 48.0
let scheduleMapFanCardHeight = 88.0
let scheduleMapFanTopPad = 24.0

struct ScheduleMapFanSlot: Equatable {
    let rotate: Double
    let scale: Double
    let opacity: Double
}

struct ScheduleMapFanLayout: Equatable {
    let direction: Double
    let shiftX: Double
    let angleStep: Double
}

func applyScheduleMapFanDrag(index: Double, dx: Double, count: Int) -> Double {
    let raw = index - dx / scheduleMapFanStepPx
    let maxIndex = Double(max(0, count - 1))
    if raw < 0 { return raw * scheduleMapFanEdgeResistance }
    if raw > maxIndex { return maxIndex + (raw - maxIndex) * scheduleMapFanEdgeResistance }
    return raw
}

func snapScheduleMapFanIndex(index: Double, vx: Double, count: Int) -> Int {
    let velocity = min(scheduleMapFanVelocityClamp, max(-scheduleMapFanVelocityClamp, -vx / scheduleMapFanVelocityDivisor))
    let rounded = Int((index + velocity).rounded())
    return min(max(0, count - 1), max(0, rounded))
}

func isScheduleMapFanTap(dx: Double, dy: Double, speed: Double) -> Bool {
    hypot(dx, dy) < scheduleMapFanTapSlop && speed < scheduleMapFanTapSpeed
}

func isScheduleMapFanDismissFlick(vx: Double, vy: Double) -> Bool {
    vy > scheduleMapFanFlickDown && abs(vy) > abs(vx)
}

func scheduleMapFanSlot(offset: Double) -> ScheduleMapFanSlot? {
    let absOffset = abs(offset)
    guard absOffset <= 2 else { return nil }
    let scale = absOffset <= 1 ? 1 - 0.12 * absOffset : 0.88 - 0.12 * (absOffset - 1)
    let opacity = absOffset <= 1 ? 1 - 0.14 * absOffset : 0.86 - 0.3 * (absOffset - 1)
    return ScheduleMapFanSlot(rotate: offset * scheduleMapFanAngleStepDeg, scale: scale, opacity: opacity)
}

func scheduleMapFanLayout(origin: CGPoint, canvas: CGSize) -> ScheduleMapFanLayout {
    let needed = scheduleMapFanRadius + scheduleMapFanCardHeight + scheduleMapFanTopPad
    let direction = origin.y >= needed ? -1.0 : 1.0
    let half = 2 * scheduleMapFanRadius * sin(scheduleMapFanAngleStepDeg * .pi / 180)
    var shiftX = 0.0
    if origin.x - half < 0 { shiftX = min(scheduleMapFanMaxShift, half - origin.x) }
    if origin.x + half > canvas.width {
        shiftX = max(-scheduleMapFanMaxShift, canvas.width - origin.x - half)
    }
    let stillOverflows = origin.x + shiftX - half < 0 || origin.x + shiftX + half > canvas.width
    return ScheduleMapFanLayout(
        direction: direction,
        shiftX: shiftX,
        angleStep: stillOverflows ? scheduleMapFanMinAngleStepDeg : scheduleMapFanAngleStepDeg
    )
}
```

- [ ] **Step 4: Re-run the iOS tests**

Same `xcodebuild … -only-testing:TimiaTests/ScheduleMapClustersTests test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codes/mobile/ios/Timia/Features/Schedule/ScheduleMapClusters.swift \
  codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFan.swift \
  codes/mobile/ios/TimiaTests/ScheduleMapClustersTests.swift \
  codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFilters.swift
git commit -m "feat(ios): cluster nearby map tasks and add fan physics"
```

---

### Task 6: iOS chest + fan overlay

**Files:**
- Create: `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapChestLabel.swift`
- Create: `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFanOverlay.swift`
- Modify: `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapView.swift`

**Interfaces:**
- Consumes: `ScheduleMapTaskCluster`, `clusterScheduleMapItems`, `scheduleMapClusterFocusIndex`, fan helpers
- Produces: map annotations are `ScheduleMapPinLabel` (1 item) or `ScheduleMapChestLabel` (2+); fan overlay replaces `confirmationDialog("选择任务")`

- [ ] **Step 1: Add the closed chest view**

Create `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapChestLabel.swift`:

```swift
import SwiftUI

struct ScheduleMapChestLabel: View {
    let placeTitle: String
    let count: Int
    var isExpanded: Bool = false

    var body: some View {
        let badge = count > 99 ? "99+" : "\(count)"
        VStack(spacing: 4) {
            ZStack(alignment: .topLeading) {
                ForEach([2, 1], id: \.self) { layer in
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(TimiaTheme.surface)
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(TimiaTheme.border.opacity(0.55)))
                        .offset(x: CGFloat(layer * 4), y: CGFloat(-layer * 4))
                }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(placeTitle).font(.caption.weight(.semibold)).lineLimit(1)
                        Text(badge)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(TimiaTheme.primary)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(TimiaTheme.primary.opacity(0.12), in: Capsule())
                    }
                    Text("\(count) 个任务")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(TimiaTheme.border.opacity(0.55)))
            }
            Circle()
                .fill(TimiaTheme.primary)
                .frame(width: 14, height: 14)
                .overlay(Circle().stroke(.white, lineWidth: 2))
        }
        .scaleEffect(isExpanded ? 1.04 : 1)
        .accessibilityLabel("\(placeTitle)，\(count) 个任务，点按查看")
        .accessibilityAddTraits(isExpanded ? .isSelected : [])
    }
}
```

- [ ] **Step 2: Add the fan overlay**

Create `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFanOverlay.swift`:

```swift
import SwiftUI

struct ScheduleMapFanOverlay: View {
    let cluster: ScheduleMapTaskCluster
    let origin: CGPoint
    let canvas: CGSize
    @Binding var index: Double
    var onSelect: (ScheduleMapItem) -> Void
    var onDismiss: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var dragStartIndex: Double?

    var body: some View {
        let layout = scheduleMapFanLayout(origin: origin, canvas: canvas)
        let center = Int(index.rounded())
        ZStack(alignment: .topLeading) {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { onDismiss() }
            VStack(spacing: 8) {
                Text("\(center + 1) / \(cluster.items.count)")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                ZStack {
                    ForEach(Array(cluster.items.enumerated()), id: \.element.id) { itemIndex, item in
                        if let slot = scheduleMapFanSlot(offset: Double(itemIndex) - index) {
                            let angle = (Double(itemIndex) - index) * layout.angleStep * .pi / 180
                            let x = sin(angle) * scheduleMapFanRadius
                            let y = layout.direction * (1 - cos(angle)) * scheduleMapFanRadius
                            fanCard(item: item, itemIndex: itemIndex, center: center)
                                .rotationEffect(.degrees(slot.rotate * layout.direction))
                                .scaleEffect(slot.scale)
                                .opacity(slot.opacity)
                                .offset(x: x, y: y - scheduleMapFanCardHeight)
                                .zIndex(20 - abs(Double(itemIndex) - index) * 10)
                        }
                    }
                }
                .frame(width: 200, height: scheduleMapFanCardHeight)
            }
            .position(x: origin.x + layout.shiftX, y: origin.y)
        }
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in
                    if dragStartIndex == nil { dragStartIndex = index }
                    index = applyScheduleMapFanDrag(index: dragStartIndex ?? index, dx: value.translation.width, count: cluster.items.count)
                }
                .onEnded { value in
                    let start = dragStartIndex ?? index
                    dragStartIndex = nil
                    let dx = value.translation.width
                    let dy = value.translation.height
                    let predicted = value.predictedEndTranslation
                    let vx = predicted.width
                    let vy = predicted.height
                    if isScheduleMapFanDismissFlick(vx: vx, vy: vy) {
                        onDismiss()
                        return
                    }
                    if isScheduleMapFanTap(dx: dx, dy: dy, speed: hypot(vx, vy)) {
                        return
                    }
                    index = Double(snapScheduleMapFanIndex(index: applyScheduleMapFanDrag(index: start, dx: dx, count: cluster.items.count), vx: vx, count: cluster.items.count))
                }
        )
    }

    private func fanCard(item: ScheduleMapItem, itemIndex: Int, center: Int) -> some View {
        let style = SchedulePriorityStyle(
            priority: item.priority,
            colorScheme: colorScheme,
            isCompleted: isCalendarTaskCompleted(item.status)
        )
        let time = scheduleMapTimeLabel(startAt: item.startAt, endAt: item.endAt)
        let status = scheduleMapStatusLabel(item.status)
        return Button {
            if itemIndex == center {
                onSelect(item)
            } else {
                index = Double(itemIndex)
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.caption.weight(.semibold)).foregroundStyle(style.foreground).lineLimit(1)
                Text(time).font(.caption2).foregroundStyle(style.foreground.opacity(0.82)).lineLimit(1)
                Text(status).font(.caption2).foregroundStyle(style.foreground.opacity(0.82)).lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .frame(width: 200, alignment: .leading)
            .background(style.background, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(style.accent.opacity(0.55), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("第 \(itemIndex + 1) 张，共 \(cluster.items.count) 张，\(item.title)，\(time)，\(status)")
    }
}
```

`isCalendarTaskCompleted` already exists as an internal helper in `CalendarCompletedCardStyle.swift`; call it from this overlay.

- [ ] **Step 3: Wire `ScheduleMapView`**

In `codes/mobile/ios/Timia/Features/Schedule/ScheduleMapView.swift`:

1. Delete `@State private var clusteredSelection` and the `.confirmationDialog("选择任务"…)` block.
2. Replace the private `ScheduleMapCluster` computed property with:

```swift
private var clusters: [ScheduleMapTaskCluster] {
    clusterScheduleMapItems(items, now: Date(), placeFallback: "这个地点")
}
```

3. Add `@State private var openClusterId: String?` and `@State private var fanIndex: Double = 0`.
4. Wrap the map in `MapReader { proxy in … }`. For each cluster:
   - 1 item: existing `ScheduleMapPinLabel`; tap `onTaskTap(anchor.asScheduleTask())`
   - 2+ items: `ScheduleMapChestLabel`; tap sets `openClusterId` and `fanIndex = Double(scheduleMapClusterFocusIndex(cluster.items, now: Date()))`
5. When `openClusterId != nil`, set `Map(position: $cameraPosition, interactionModes: [])`.
6. Overlay `ScheduleMapFanOverlay` when an open cluster exists, using `proxy.convert(ChinaCoordinate.mapKitCoordinate(lat:lng:), from: .global)` (or `.local` if that is the space the overlay uses — pick one and keep overlay `.position` in the same space).
7. On items refresh: if the open cluster’s id set changed, set `openClusterId = nil`; otherwise clamp `fanIndex`.
8. Center-card select: clear `openClusterId`, then `onTaskTap`.
9. Keep `ScheduleMapPinLabel` as the single-task face.

- [ ] **Step 4: Run iOS tests and a map-mode build**

```bash
cd codes/mobile/ios
xcodegen generate
xcodebuild -project Timia.xcodeproj -scheme Timia \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/timia-ios-derived CODE_SIGNING_ALLOWED=NO \
  -only-testing:TimiaTests/ScheduleMapFiltersTests \
  -only-testing:TimiaTests/ScheduleMapClustersTests test
```

Expected: PASS. `ScheduleMapView.swift` must contain no `confirmationDialog` and no `clusteredSelection`.

- [ ] **Step 5: Commit**

```bash
git add codes/mobile/ios/Timia/Features/Schedule/ScheduleMapChestLabel.swift \
  codes/mobile/ios/Timia/Features/Schedule/ScheduleMapFanOverlay.swift \
  codes/mobile/ios/Timia/Features/Schedule/ScheduleMapView.swift
git commit -m "feat(ios): show overlapping map tasks as a swipeable chest fan"
```

---

## Self-review

Spec coverage:

| Spec section | Task |
|--------------|------|
| 2.x grouping, majority, sort, focus | 1, 5 |
| 3 closed chest | 3, 4, 6 |
| 4 poker fan geometry / animation constants | 2, 4, 6 |
| 5 carousel, tap vs drag, dismiss, lock map | 2, 4, 6 |
| 6 Web overlay / iOS overlay, no system menu | 4, 6 |
| 7 file boundaries | file map |
| 8 filter shrink / close | 4, 6 |
| 9 tests | 1–6 |
| 10 no backend / no zoom cluster | global constraints |

No `TBD` / “implement later”. Web and iOS share the same function names and numeric constants.
