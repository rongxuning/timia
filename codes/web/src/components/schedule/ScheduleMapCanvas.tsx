"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTranslations } from "next-intl";
import {
  desaturateHex,
  formatScheduleTimeRange,
  isSettledCalendarStatus,
  taskCalendarColors,
} from "@/components/schedule/taskUtils";
import { TASK_STATUS_ICON } from "@/components/schedule/TaskStatusIcon";
import { CHINA_OVERVIEW, mapLibreStyle } from "@/lib/map/osmStyle";
import {
  scheduleMapCamera,
  scheduleMapCameraMove,
  scheduleMapEmptyCardClassName,
} from "@/lib/scheduleMapCamera";
import { scheduleMapPinColor, type ScheduleMapItem } from "@/lib/scheduleMapGeo";
import {
  createScheduleMapPinElement,
  groupScheduleMapItemsByCoordinate,
  scheduleMapCardCopy,
} from "@/lib/scheduleMapPins";

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

function cameraForItems(items: ScheduleMapItem[]) {
  return scheduleMapCamera(
    items.map((item) => ({ lng: item.location_lng, lat: item.location_lat })),
  );
}

function applyCamera(map: maplibregl.Map, items: ScheduleMapItem[], animate: boolean) {
  const camera = cameraForItems(items);
  const next = { center: [camera.lng, camera.lat] as [number, number], zoom: camera.zoom };
  const move = scheduleMapCameraMove(items.length, animate);
  if (move.kind === "fly") {
    map.flyTo({ ...next, duration: move.durationMs });
    return;
  }
  map.jumpTo(next);
}

export function ScheduleMapCanvas({ items, loading, emptyMessage, onItemClick }: ScheduleMapCanvasProps) {
  const t = useTranslations("scheduleMap");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const applyItemsRef = useRef<((next: ScheduleMapItem[], animate: boolean) => void) | undefined>(
    undefined,
  );
  const itemsRef = useRef(items);
  const onItemClickRef = useRef(onItemClick);
  const labelsRef = useRef({
    unscheduled: t("unscheduled"),
    moreItems: (title: string, count: number) => t("moreItems", { title, count }),
    status: (status: string) => statusLabel(status),
    pinAria: (title: string, time: string, status: string, location: string) =>
      t("pinAria", { title, time, status, location }),
  });
  itemsRef.current = items;
  onItemClickRef.current = onItemClick;
  labelsRef.current = {
    unscheduled: t("unscheduled"),
    moreItems: (title: string, count: number) => t("moreItems", { title, count }),
    status: (status: string) => statusLabel(status),
    pinAria: (title: string, time: string, status: string, location: string) =>
      t("pinAria", { title, time, status, location }),
  };

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
        meta.textContent = [statusLabel(item.status), time, item.location]
          .filter(Boolean)
          .join(" · ");
        button.append(title, meta);
        button.addEventListener("click", () => openTask(item));
        root.append(button);
      }
      popup.setLngLat(lngLat).setDOMContent(root).addTo(map);
    }

    function clearMarkers() {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    }

    function syncMarkers(next: ScheduleMapItem[]) {
      clearMarkers();
      const labels = labelsRef.current;
      for (const group of groupScheduleMapItemsByCoordinate(next)) {
        const copy = scheduleMapCardCopy(group, labels, formatScheduleTimeRange);
        const colors = taskCalendarColors(group[0].priority);
        const background = isSettledCalendarStatus(group[0].status)
          ? desaturateHex(colors.bg)
          : colors.bg;
        const el = createScheduleMapPinElement({
          ...copy,
          accent: scheduleMapPinColor(group[0]),
          background,
          foreground: colors.fg,
          ariaLabel: labels.pinAria(copy.title, copy.timeLabel, copy.statusLabel, copy.locationLabel),
        });
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          renderList([group[0].location_lng, group[0].location_lat], group);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([group[0].location_lng, group[0].location_lat])
          .addTo(map);
        marker.getElement().style.zIndex = "2";
        markersRef.current.push(marker);
      }
    }

    function applyItems(next: ScheduleMapItem[], animate: boolean) {
      syncMarkers(next);
      applyCamera(map, next, animate);
    }
    applyItemsRef.current = applyItems;

    const onLoad = () => {
      applyItems(itemsRef.current, itemsRef.current.length > 0);
    };

    if (map.loaded()) onLoad();
    else map.once("load", onLoad);

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      clearMarkers();
      popup.remove();
      map.remove();
      mapRef.current = null;
      popupRef.current = null;
      applyItemsRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const applyItems = applyItemsRef.current;
    if (!map || !applyItems) return;
    applyItems(items, true);
    popupRef.current?.remove();
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
          <p className={scheduleMapEmptyCardClassName()}>{emptyMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
