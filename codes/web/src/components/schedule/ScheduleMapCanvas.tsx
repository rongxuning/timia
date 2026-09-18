"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTranslations } from "next-intl";
import { formatScheduleTimeRange } from "@/components/schedule/taskUtils";
import { TASK_STATUS_ICON } from "@/components/schedule/TaskStatusIcon";
import { CHINA_OVERVIEW, mapLibreStyle } from "@/lib/map/osmStyle";
import {
  buildScheduleMapCollection,
  emptyScheduleMapCollection,
  itemsById,
  type ScheduleMapItem,
} from "@/lib/scheduleMapGeo";

const SOURCE_ID = "schedule-map-tasks";
const CLUSTER_LAYER = "schedule-map-clusters";
const CLUSTER_COUNT_LAYER = "schedule-map-cluster-count";
const POINT_LAYER = "schedule-map-points";

type ScheduleMapCanvasProps = {
  items: ScheduleMapItem[];
  loading: boolean;
  emptyMessage: string | null;
  onItemClick: (item: ScheduleMapItem) => void;
};

function statusLabel(status: string): string {
  if (status === "todo" || status === "doing" || status === "done" || status === "archived") {
    return TASK_STATUS_ICON[status].label;
  }
  return status;
}

function lookupItems(
  ids: string[],
  byId: Map<string, ScheduleMapItem>,
): ScheduleMapItem[] {
  const found: ScheduleMapItem[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) found.push(item);
  }
  return found;
}

export function ScheduleMapCanvas({ items, loading, emptyMessage, onItemClick }: ScheduleMapCanvasProps) {
  const t = useTranslations("scheduleMap");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const itemsRef = useRef(items);
  const onItemClickRef = useRef(onItemClick);
  itemsRef.current = items;
  onItemClickRef.current = onItemClick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: mapLibreStyle(),
      center: [CHINA_OVERVIEW.lng, CHINA_OVERVIEW.lat],
      zoom: CHINA_OVERVIEW.zoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: true,
      maxWidth: "320px",
      className: "schedule-map-popup",
    });
    popupRef.current = popup;

    function closePopup() {
      popup.remove();
    }

    function openTask(item: ScheduleMapItem) {
      closePopup();
      onItemClickRef.current(item);
    }

    function renderList(lngLat: maplibregl.LngLatLike, list: ScheduleMapItem[]) {
      if (list.length === 1) {
        openTask(list[0]);
        return;
      }
      const root = document.createElement("div");
      root.className = "flex max-h-64 min-w-56 flex-col gap-1 overflow-y-auto p-1";
      for (const item of list) {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-container-lowest";
        const title = document.createElement("div");
        title.className = "truncate text-small font-medium text-text-primary";
        title.textContent = item.title;
        const meta = document.createElement("div");
        meta.className = "truncate text-caption text-text-secondary";
        const time = formatScheduleTimeRange(item.start_at, item.end_at);
        meta.textContent = [statusLabel(item.status), time, `${item.workspace_name} / ${item.project_name}`]
          .filter(Boolean)
          .join(" · ");
        button.append(title, meta);
        button.addEventListener("click", () => openTask(item));
        root.append(button);
      }
      popup.setLngLat(lngLat).setDOMContent(root).addTo(map);
    }

    function applyItems(next: ScheduleMapItem[]) {
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData(buildScheduleMapCollection(next) as never);
      if (next.length === 0) return;
      const bounds = new maplibregl.LngLatBounds();
      for (const item of next) bounds.extend([item.location_lng, item.location_lat]);
      if (next.length === 1) {
        map.easeTo({
          center: [next[0].location_lng, next[0].location_lat],
          zoom: 14,
          duration: 400,
        });
        return;
      }
      map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 400 });
    }

    function onClusterClick(event: maplibregl.MapMouseEvent) {
      const feature = map.queryRenderedFeatures(event.point, { layers: [CLUSTER_LAYER] })[0];
      if (!feature || feature.geometry.type !== "Point") return;
      const clusterId = feature.properties?.cluster_id as number | undefined;
      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (clusterId == null || !source) return;
      const coordinates = feature.geometry.coordinates as [number, number];
      void source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const current = map.getZoom();
        if (zoom == null || zoom <= current + 0.05) {
          void source.getClusterLeaves(clusterId, 50, 0).then((leaves) => {
            const ids = leaves
              .map((leaf) => (leaf.properties as { id?: string } | null)?.id)
              .filter((id): id is string => Boolean(id));
            renderList(coordinates, lookupItems(ids, itemsById(itemsRef.current)));
          });
          return;
        }
        map.easeTo({ center: coordinates, zoom });
      });
    }

    function onPointClick(event: maplibregl.MapMouseEvent) {
      const features = map.queryRenderedFeatures(event.point, { layers: [POINT_LAYER] });
      if (features.length === 0) return;
      const ids = features
        .map((feature) => (feature.properties as { id?: string } | null)?.id)
        .filter((id): id is string => Boolean(id));
      const unique = [...new Set(ids)];
      const list = lookupItems(unique, itemsById(itemsRef.current));
      const coords =
        features[0].geometry.type === "Point"
          ? (features[0].geometry.coordinates as [number, number])
          : event.lngLat.toArray();
      renderList(coords, list);
    }

    function setPointer() {
      map.getCanvas().style.cursor = "pointer";
    }
    function clearPointer() {
      map.getCanvas().style.cursor = "";
    }

    const onLoad = () => {
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: emptyScheduleMapCollection() as never,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });
      map.addLayer({
        id: CLUSTER_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#4648d4",
          "circle-radius": ["step", ["get", "point_count"], 16, 8, 20, 25, 26],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: "symbol",
        source: SOURCE_ID,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
        },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: POINT_LAYER,
        type: "circle",
        source: SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["get", "pinColor"],
          "circle-radius": 8,
          "circle-stroke-width": 2,
          "circle-stroke-color": ["get", "strokeColor"],
        },
      });
      map.on("click", CLUSTER_LAYER, onClusterClick);
      map.on("click", POINT_LAYER, onPointClick);
      map.on("mouseenter", CLUSTER_LAYER, setPointer);
      map.on("mouseenter", POINT_LAYER, setPointer);
      map.on("mouseleave", CLUSTER_LAYER, clearPointer);
      map.on("mouseleave", POINT_LAYER, clearPointer);
      applyItems(itemsRef.current);
    };

    if (map.loaded()) onLoad();
    else map.once("load", onLoad);

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getSource(SOURCE_ID)) return;
    const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
    source.setData(buildScheduleMapCollection(items) as never);
    popupRef.current?.remove();
    if (items.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const item of items) bounds.extend([item.location_lng, item.location_lat]);
    if (items.length === 1) {
      map.easeTo({
        center: [items[0].location_lng, items[0].location_lat],
        zoom: 14,
        duration: 400,
      });
      return;
    }
    map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 400 });
  }, [items]);

  return (
    <div className="relative min-h-[60vh] flex-1 overflow-hidden rounded-b-xl bg-white lg:min-h-0">
      <div
        ref={containerRef}
        className={[
          "absolute inset-0 h-full w-full transition-opacity",
          loading ? "opacity-70" : "opacity-100",
        ].join(" ")}
        aria-label={t("canvasAria")}
        aria-busy={loading}
      />
      {emptyMessage ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <p className="max-w-md rounded-xl bg-white/90 px-4 py-3 text-center text-small text-text-secondary shadow-sm">
            {emptyMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}
