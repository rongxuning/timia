"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import type { FeatureCollection, LineString } from "geojson";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { HealthWorkoutDetail } from "@/types/api/views/health";

const FAST_COLOR = "#22c55e";
const SLOW_COLOR = "#64748b";
const START_COLOR = "#4648d4";
const END_COLOR = "#ef4444";

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

type WorkoutRouteMapProps = {
  route: HealthWorkoutDetail["route"];
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

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerpColor(fast: string, slow: string, t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const [fr, fg, fb] = hexToRgb(fast);
  const [sr, sg, sb] = hexToRgb(slow);
  const r = Math.round(fr + (sr - fr) * clamped);
  const g = Math.round(fg + (sg - fg) * clamped);
  const b = Math.round(fb + (sb - fb) * clamped);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function paceColor(pace: number, minPace: number, maxPace: number): string {
  if (maxPace <= minPace) return FAST_COLOR;
  return lerpColor(FAST_COLOR, SLOW_COLOR, (pace - minPace) / (maxPace - minPace));
}

function buildRouteGeoJSON(points: RoutePoint[]): FeatureCollection<LineString, { color: string }> {
  const segs: { a: RoutePoint; b: RoutePoint; pace: number }[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const dist = haversineMeters(a, b);
    const dt = b.t - a.t;
    if (dist < 0.5 || dt <= 0) continue;
    const pace = dt / (dist / 1000);
    if (!Number.isFinite(pace) || pace <= 0) continue;
    segs.push({ a, b, pace });
  }

  if (segs.length === 0) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { color: FAST_COLOR },
          geometry: {
            type: "LineString",
            coordinates: points.map((point) => [point.lng, point.lat]),
          },
        },
      ],
    };
  }

  const paces = segs.map((seg) => seg.pace).sort((x, y) => x - y);
  const minPace = paces[Math.floor((paces.length - 1) * 0.1)] ?? paces[0];
  const maxPace = paces[Math.floor((paces.length - 1) * 0.9)] ?? paces[paces.length - 1];

  return {
    type: "FeatureCollection",
    features: segs.map((seg) => ({
      type: "Feature",
      properties: { color: paceColor(seg.pace, minPace, maxPace) },
      geometry: {
        type: "LineString",
        coordinates: [
          [seg.a.lng, seg.a.lat],
          [seg.b.lng, seg.b.lat],
        ],
      },
    })),
  };
}

function makeMarkerEl(color: string, label: string, text?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", label);
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
  ].join(";");
  if (text) el.textContent = text;
  return el;
}

function mapStyle(): string | StyleSpecification {
  return process.env.NEXT_PUBLIC_MAP_STYLE_URL || OSM_RASTER_STYLE;
}

export function WorkoutRouteMap({ route }: WorkoutRouteMapProps) {
  const points = route?.points;
  const kmMarkers = route?.km_markers;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !points || points.length < 2) return;

    const map = new maplibregl.Map({
      container,
      style: mapStyle(),
      center: [points[0].lng, points[0].lat],
      zoom: 13,
      attributionControl: { compact: true },
    });

    const markers: maplibregl.Marker[] = [];
    let cancelled = false;

    const start = points[0];
    const end = points[points.length - 1];
    markers.push(
      new maplibregl.Marker({ element: makeMarkerEl(START_COLOR, "起点") })
        .setLngLat([start.lng, start.lat])
        .addTo(map),
    );
    markers.push(
      new maplibregl.Marker({ element: makeMarkerEl(END_COLOR, "终点") })
        .setLngLat([end.lng, end.lat])
        .addTo(map),
    );
    for (const marker of kmMarkers ?? []) {
      markers.push(
        new maplibregl.Marker({
          element: makeMarkerEl(START_COLOR, `${marker.km} 公里`, String(marker.km)),
        })
          .setLngLat([marker.lng, marker.lat])
          .addTo(map),
      );
    }

    const bounds = new maplibregl.LngLatBounds();
    for (const point of points) bounds.extend([point.lng, point.lat]);

    map.on("load", () => {
      if (cancelled) return;
      map.addSource("workout-route", {
        type: "geojson",
        data: buildRouteGeoJSON(points),
      });
      map.addLayer({
        id: "workout-route-line",
        type: "line",
        source: "workout-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": ["get", "color"],
          "line-width": 4,
        },
      });
      map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 });
    });

    return () => {
      cancelled = true;
      for (const marker of markers) marker.remove();
      map.remove();
    };
  }, [points, kmMarkers]);

  if (!points || points.length < 2) return null;

  return (
    <div
      ref={containerRef}
      className="h-64 w-full overflow-hidden rounded-xl border border-border-subtle bg-white shadow-sm"
      aria-label="训练路线地图"
    />
  );
}
