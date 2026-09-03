"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PACE_ZONE_HEX } from "@/components/health/WorkoutZoneBar";
import type { HealthWorkoutDetail } from "@/types/api/views/health";

const START_COLOR = "#4648d4";
const END_COLOR = "#ef4444";
const TRACK_FALLBACK = "#4648d4";

const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

type RoutePoint = {
  t: number;
  lat: number;
  lng: number;
  alt?: number | null;
};

type PaceZone = NonNullable<HealthWorkoutDetail["pace_zones"]>[number];

type PaceSeg = {
  a: RoutePoint;
  b: RoutePoint;
  color: string;
};

type WorkoutRouteMapProps = {
  route: HealthWorkoutDetail["route"];
  paceZones?: HealthWorkoutDetail["pace_zones"];
};

function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ZONE_ORDER = ["E", "M", "T", "I", "R"] as const;

function colorForZoneKey(key: string): string {
  const index = ZONE_ORDER.indexOf(key as (typeof ZONE_ORDER)[number]);
  if (index >= 0) return PACE_ZONE_HEX[index] ?? PACE_ZONE_HEX[2];
  return TRACK_FALLBACK;
}

function colorForPace(pace: number, zones: PaceZone[]): string {
  const ordered = [...zones].sort((a, b) => {
    const ai = ZONE_ORDER.indexOf(String(a.zone) as (typeof ZONE_ORDER)[number]);
    const bi = ZONE_ORDER.indexOf(String(b.zone) as (typeof ZONE_ORDER)[number]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  const easiest = ordered[0];
  const hardest = ordered[ordered.length - 1];
  if (pace > easiest.hi) return colorForZoneKey(String(easiest.zone));
  if (pace < hardest.lo) return colorForZoneKey(String(hardest.zone));
  for (const zone of ordered) {
    if (pace >= zone.lo && pace <= zone.hi) return colorForZoneKey(String(zone.zone));
  }
  let best = ordered[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const zone of ordered) {
    const mid = (zone.lo + zone.hi) / 2;
    const dist = Math.abs(pace - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = zone;
    }
  }
  return colorForZoneKey(String(best.zone));
}

function buildPaceSegments(
  points: RoutePoint[],
  paceZones: PaceZone[] | null | undefined,
): PaceSeg[] {
  const raw: { a: RoutePoint; b: RoutePoint; pace: number }[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng)) continue;
    if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) continue;
    if (a.lat === b.lat && a.lng === b.lng) continue;
    const dist = haversineMeters(a, b);
    const dt = b.t - a.t;
    // Keep near-stationary GPS jitter so the polyline stays continuous.
    const pace = dist >= 0.5 && dt > 0 ? dt / (dist / 1000) : Number.NaN;
    raw.push({ a, b, pace });
  }
  if (raw.length === 0) return [];

  const validPaces = raw
    .map((seg) => seg.pace)
    .filter((pace) => Number.isFinite(pace) && pace > 0 && pace < 3600);
  const pacesSorted = [...validPaces].sort((x, y) => x - y);

  const rankColor = (pace: number): string => {
    if (!Number.isFinite(pace) || pace <= 0 || pace >= 3600) return TRACK_FALLBACK;
    if (paceZones && paceZones.length > 0) return colorForPace(pace, paceZones);
    if (pacesSorted.length === 0) return TRACK_FALLBACK;
    const idx = pacesSorted.findIndex((value) => value >= pace);
    const rank = idx < 0 ? pacesSorted.length - 1 : idx;
    const t = pacesSorted.length <= 1 ? 0.5 : rank / (pacesSorted.length - 1);
    const bucket = Math.min(4, Math.max(0, Math.floor((1 - t) * 5)));
    return PACE_ZONE_HEX[bucket] ?? TRACK_FALLBACK;
  };

  return raw.map((seg) => ({
    a: seg.a,
    b: seg.b,
    color: rankColor(seg.pace),
  }));
}

function makeMarkerEl(color: string, label: string, text?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
  el.className = "workout-route-marker";
  // Do not set position here — MapLibre Marker requires position:absolute on this root.
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    `width:${text ? "20px" : "12px"}`,
    `height:${text ? "20px" : "12px"}`,
    "border-radius:9999px",
    `background:${text ? "#ffffff" : color}`,
    `border:2px solid ${color}`,
    "box-shadow:0 1px 2px rgb(0 0 0 / 0.2)",
    "font-size:10px",
    "font-weight:600",
    `color:${color}`,
    "line-height:1",
    "user-select:none",
    "z-index:2",
  ].join(";");
  if (text) el.textContent = text;
  return el;
}

/** Cut kilometre points on the same polyline used for the track (avoids off-path markers). */
function kmMarkersFromPoints(points: RoutePoint[]): Array<{ km: number; lat: number; lng: number }> {
  if (points.length < 2) return [];
  const markers: Array<{ km: number; lat: number; lng: number }> = [];
  let cum = 0;
  let nextKm = 1000;
  let km = 1;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    let segment = haversineMeters(prev, cur);
    while (segment > 0 && cum + segment >= nextKm) {
      const frac = (nextKm - cum) / segment;
      markers.push({
        km,
        lat: prev.lat + frac * (cur.lat - prev.lat),
        lng: prev.lng + frac * (cur.lng - prev.lng),
      });
      km += 1;
      nextKm += 1000;
    }
    cum += segment;
  }
  return markers;
}

function mapStyle(): string | StyleSpecification {
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL || OSM_RASTER_STYLE;
}

function drawTrackOverlay(
  ctx: CanvasRenderingContext2D,
  map: maplibregl.Map,
  segments: PaceSeg[],
  dpr: number,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (segments.length === 0) return;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // White casing for contrast on busy basemaps.
  ctx.lineWidth = 7 * dpr;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const a = map.project([seg.a.lng, seg.a.lat]);
    const b = map.project([seg.b.lng, seg.b.lat]);
    if (i === 0) ctx.moveTo(a.x * dpr, a.y * dpr);
    else ctx.lineTo(a.x * dpr, a.y * dpr);
    ctx.lineTo(b.x * dpr, b.y * dpr);
  }
  ctx.stroke();

  // Pace-colored segments.
  ctx.lineWidth = 4 * dpr;
  for (const seg of segments) {
    const a = map.project([seg.a.lng, seg.a.lat]);
    const b = map.project([seg.b.lng, seg.b.lat]);
    ctx.beginPath();
    ctx.strokeStyle = seg.color;
    ctx.moveTo(a.x * dpr, a.y * dpr);
    ctx.lineTo(b.x * dpr, b.y * dpr);
    ctx.stroke();
  }
}

export function WorkoutRouteMap({ route, paceZones }: WorkoutRouteMapProps) {
  const points = route?.points;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !points || points.length < 2) return;

    const routePoints = points as RoutePoint[];
    const segments = buildPaceSegments(routePoints, paceZones);
    const kmMarkers = kmMarkersFromPoints(routePoints);
    const map = new maplibregl.Map({
      container,
      style: mapStyle(),
      center: [routePoints[0].lng, routePoints[0].lat],
      zoom: 13,
      attributionControl: { compact: true },
    });

    const markers: maplibregl.Marker[] = [];
    let cancelled = false;
    let overlay: HTMLCanvasElement | null = null;
    let removeRender: (() => void) | null = null;

    const start = routePoints[0];
    const end = routePoints[routePoints.length - 1];
    const addMarker = (lng: number, lat: number, el: HTMLDivElement) => {
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lng, lat])
        .addTo(map);
      // Above track canvas stack (canvas-container z-index:1); keep MapLibre absolute positioning.
      marker.getElement().style.zIndex = "2";
      markers.push(marker);
    };
    addMarker(start.lng, start.lat, makeMarkerEl(START_COLOR, "起点"));
    addMarker(end.lng, end.lat, makeMarkerEl(END_COLOR, "终点"));
    for (const marker of kmMarkers) {
      addMarker(marker.lng, marker.lat, makeMarkerEl(START_COLOR, `${marker.km} 公里`, String(marker.km)));
    }

    const bounds = new maplibregl.LngLatBounds();
    for (const point of routePoints) bounds.extend([point.lng, point.lat]);

    const syncOverlay = () => {
      if (cancelled || !overlay) return;
      const canvas = map.getCanvas();
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width <= 0 || height <= 0) return;
      overlay.width = Math.round(width * dpr);
      overlay.height = Math.round(height * dpr);
      overlay.style.width = `${width}px`;
      overlay.style.height = `${height}px`;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      drawTrackOverlay(ctx, map, segments, dpr);
    };

    const mountOverlay = () => {
      if (cancelled || overlay) return;
      map.getCanvasContainer().style.zIndex = "1";
      overlay = document.createElement("canvas");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = [
        "position:absolute",
        "left:0",
        "top:0",
        "width:100%",
        "height:100%",
        "pointer-events:none",
        "z-index:1",
      ].join(";");
      map.getCanvasContainer().appendChild(overlay);
      syncOverlay();
      map.on("render", syncOverlay);
      removeRender = () => map.off("render", syncOverlay);
      map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 });
    };

    if (map.loaded()) {
      mountOverlay();
    } else {
      map.once("load", mountOverlay);
    }

    return () => {
      cancelled = true;
      removeRender?.();
      overlay?.remove();
      for (const marker of markers) marker.remove();
      map.remove();
    };
  }, [points, paceZones]);

  if (!points || points.length < 2) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="relative h-64 w-full overflow-hidden rounded-xl border border-border-subtle bg-white shadow-sm"
      aria-label="训练路线地图"
    />
  );
}
