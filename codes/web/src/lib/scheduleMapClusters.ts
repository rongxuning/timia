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
    const anchor = majority(cluster.items, (item) =>
      scheduleMapCoordinateKey(item.location_lat, item.location_lng),
    );
    const named = cluster.items
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
