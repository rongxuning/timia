export type MapLngLat = {
  lng: number;
  lat: number;
};

export type ScheduleMapCamera = MapLngLat & {
  zoom: number;
};

export const EMPTY_MAP_CAMERA: ScheduleMapCamera = { lng: 105, lat: 35, zoom: 4 };
export const SINGLE_POINT_ZOOM = 15;
export const MIN_CAMERA_ZOOM = 4;
export const MAX_CAMERA_ZOOM = 16;
/** Fly from the country overview to placed tasks when opening map mode. */
export const SCHEDULE_MAP_FLY_DURATION_MS = 3000;
/** Neighborhood-scale radius used to decide that points are "in one area". */
export const CLUSTER_RADIUS_KM = 12;
export const CLUSTER_COVERAGE = 0.6;

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function kmBetween(a: MapLngLat, b: MapLngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function zoomForSpan(lngSpan: number, latSpan: number): number {
  const paddedLng = Math.max(Math.abs(lngSpan) * 1.5, 0.003);
  const paddedLat = Math.max(Math.abs(latSpan) * 1.5, 0.003);
  const span = Math.max(paddedLng, paddedLat * 1.35);
  return clamp(Math.log2(360 / span), MIN_CAMERA_ZOOM, MAX_CAMERA_ZOOM);
}

export function dominantCluster(points: MapLngLat[]): MapLngLat[] {
  if (points.length <= 1) return points;
  let best = points;
  let bestCount = 0;
  for (const seed of points) {
    const members = points.filter((point) => kmBetween(seed, point) <= CLUSTER_RADIUS_KM);
    if (members.length > bestCount) {
      best = members;
      bestCount = members.length;
    }
  }
  const coverage = bestCount / points.length;
  if (bestCount >= 2 && (coverage >= CLUSTER_COVERAGE || bestCount > points.length / 2)) {
    return best;
  }
  return points;
}

function cameraForPoints(points: MapLngLat[]): ScheduleMapCamera {
  if (points.length === 1) {
    return { lng: points[0].lng, lat: points[0].lat, zoom: SINGLE_POINT_ZOOM };
  }
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  return {
    lng: (minLng + maxLng) / 2,
    lat: (minLat + maxLat) / 2,
    zoom: zoomForSpan(maxLng - minLng, maxLat - minLat),
  };
}

export function scheduleMapCamera(points: MapLngLat[]): ScheduleMapCamera {
  if (points.length === 0) return EMPTY_MAP_CAMERA;
  return cameraForPoints(dominantCluster(points));
}

export type ScheduleMapCameraMove =
  | { kind: "jump" }
  | { kind: "fly"; durationMs: number };

export function scheduleMapCameraMove(itemCount: number, animate: boolean): ScheduleMapCameraMove {
  if (itemCount <= 0 || !animate) return { kind: "jump" };
  return { kind: "fly", durationMs: SCHEDULE_MAP_FLY_DURATION_MS };
}

/** Fixed 14rem card: CJK min-content is 1ch, which collapses a centered `w-full` overlay into a column. */
export function scheduleMapEmptyCardClassName(): string {
  return "w-56 min-w-56 max-w-[min(14rem,calc(100%-2rem))] shrink-0 rounded-xl bg-white/90 px-4 py-3 text-center text-small leading-relaxed text-text-secondary shadow-sm";
}
