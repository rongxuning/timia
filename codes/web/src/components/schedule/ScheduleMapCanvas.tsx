"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTranslations } from "next-intl";
import {
  desaturateHex,
  formatScheduleTimeRange,
  isSettledCalendarStatus,
  taskCalendarColors,
} from "@/components/schedule/taskUtils";
import { ScheduleMapFanOverlay } from "@/components/schedule/ScheduleMapFanOverlay";
import { TASK_STATUS_ICON } from "@/components/schedule/TaskStatusIcon";
import { CHINA_OVERVIEW, mapLibreStyle } from "@/lib/map/osmStyle";
import {
  scheduleMapCamera,
  scheduleMapCameraMove,
  scheduleMapEmptyCardClassName,
} from "@/lib/scheduleMapCamera";
import {
  clusterScheduleMapItems,
  findScheduleMapClusterByItemIds,
  scheduleMapClusterFocusIndex,
  type ScheduleMapCluster,
} from "@/lib/scheduleMapClusters";
import { scheduleMapPinColor, type ScheduleMapItem } from "@/lib/scheduleMapGeo";
import { createScheduleMapPinElement, scheduleMapCardCopy } from "@/lib/scheduleMapPins";

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

function itemIdSignature(items: { id: string }[]): string {
  return items
    .map((item) => item.id)
    .sort()
    .join("\0");
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

function projectFanOrigin(map: maplibregl.Map, cluster: ScheduleMapCluster<ScheduleMapItem>) {
  const point = map.project([cluster.location_lng, cluster.location_lat]);
  const container = map.getContainer();
  return {
    origin: { x: point.x, y: point.y },
    canvas: { width: container.clientWidth, height: container.clientHeight },
  };
}

export function ScheduleMapCanvas({ items, loading, emptyMessage, onItemClick }: ScheduleMapCanvasProps) {
  const t = useTranslations("scheduleMap");
  const placeFallback = t("chestPlaceFallback");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const applyItemsRef = useRef<((next: ScheduleMapItem[], animate: boolean) => void) | undefined>(
    undefined,
  );
  const itemsRef = useRef(items);
  const onItemClickRef = useRef(onItemClick);
  const placeFallbackRef = useRef(placeFallback);
  const openClusterIdRef = useRef<string | null>(null);
  const openItemIdsRef = useRef("");
  const clustersRef = useRef<ScheduleMapCluster<ScheduleMapItem>[]>([]);
  const [openClusterId, setOpenClusterId] = useState<string | null>(null);
  const [openItemIds, setOpenItemIds] = useState("");
  const [fanIndex, setFanIndex] = useState(0);
  const [fanOrigin, setFanOrigin] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const labelsRef = useRef({
    unscheduled: t("unscheduled"),
    moreItems: (title: string, count: number) => t("moreItems", { title, count }),
    status: (status: string) => statusLabel(status),
    pinAria: (title: string, time: string, status: string, location: string) =>
      t("pinAria", { title, time, status, location }),
    pinClusterAria: (title: string, time: string, status: string, location: string, count: number) =>
      t("pinClusterAria", { title, time, status, location, count }),
  });
  itemsRef.current = items;
  onItemClickRef.current = onItemClick;
  placeFallbackRef.current = placeFallback;
  labelsRef.current = {
    unscheduled: t("unscheduled"),
    moreItems: (title: string, count: number) => t("moreItems", { title, count }),
    status: (status: string) => statusLabel(status),
    pinAria: (title: string, time: string, status: string, location: string) =>
      t("pinAria", { title, time, status, location }),
    pinClusterAria: (title: string, time: string, status: string, location: string, count: number) =>
      t("pinClusterAria", { title, time, status, location, count }),
  };

  const clusters = useMemo(
    () => clusterScheduleMapItems(items, { now: new Date(), placeFallback }),
    [items, placeFallback],
  );
  clustersRef.current = clusters;
  openItemIdsRef.current = openItemIds;

  const matchedCluster =
    openClusterId !== null
      ? findScheduleMapClusterByItemIds(clusters, openItemIds ? openItemIds.split("\0") : [])
      : undefined;
  const fanIdentityLost = openClusterId !== null && matchedCluster == null;
  if (fanIdentityLost) {
    openClusterIdRef.current = null;
    openItemIdsRef.current = "";
    setOpenClusterId(null);
    setOpenItemIds("");
    setFanOrigin(null);
  } else if (matchedCluster && matchedCluster.id !== openClusterId) {
    openClusterIdRef.current = matchedCluster.id;
    setOpenClusterId(matchedCluster.id);
    const maxIndex = Math.max(0, matchedCluster.items.length - 1);
    setFanIndex((current) => Math.min(Math.max(0, current), maxIndex));
  }
  const fanCluster = fanIdentityLost ? null : (matchedCluster ?? null);

  function closeFan() {
    openClusterIdRef.current = null;
    openItemIdsRef.current = "";
    setOpenClusterId(null);
    setOpenItemIds("");
    setFanOrigin(null);
  }

  function publishFanOrigin(map: maplibregl.Map, cluster: ScheduleMapCluster<ScheduleMapItem>) {
    const projected = projectFanOrigin(map, cluster);
    setFanOrigin(projected.origin);
    setCanvasSize(projected.canvas);
  }

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

    function clearMarkers() {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    }

    function syncMarkers(next: ScheduleMapItem[]) {
      clearMarkers();
      const labels = labelsRef.current;
      const nextClusters = clusterScheduleMapItems(next, {
        now: new Date(),
        placeFallback: placeFallbackRef.current,
      });
      for (const cluster of nextClusters) {
        const el = createClusterPin(cluster, labels);
        if (cluster.items.length === 1) {
          el.addEventListener("click", (event) => {
            event.stopPropagation();
            onItemClickRef.current(cluster.items[0]);
          });
        } else {
          el.dataset.clusterId = cluster.id;
          el.setAttribute("aria-expanded", openClusterIdRef.current === cluster.id ? "true" : "false");
          el.addEventListener("click", (event) => {
            event.stopPropagation();
            map.stop();
            const signature = itemIdSignature(cluster.items);
            openClusterIdRef.current = cluster.id;
            openItemIdsRef.current = signature;
            setOpenClusterId(cluster.id);
            setOpenItemIds(signature);
            setFanIndex(scheduleMapClusterFocusIndex(cluster.items, new Date()));
          });
        }
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([cluster.location_lng, cluster.location_lat])
          .addTo(map);
        marker.getElement().style.zIndex = "2";
        markersRef.current.push(marker);
      }
      for (const marker of markersRef.current) {
        const el = marker.getElement();
        if (!el.dataset.clusterId) continue;
        const open = el.dataset.clusterId === openClusterIdRef.current;
        el.setAttribute("aria-expanded", open ? "true" : "false");
        el.style.opacity = open ? "0" : "1";
        el.style.pointerEvents = open ? "none" : "auto";
      }
      const open = findScheduleMapClusterByItemIds(
        nextClusters,
        openItemIdsRef.current ? openItemIdsRef.current.split("\0") : [],
      );
      if (open) {
        if (open.id !== openClusterIdRef.current) {
          openClusterIdRef.current = open.id;
          setOpenClusterId(open.id);
        }
        const maxIndex = Math.max(0, open.items.length - 1);
        setFanIndex((current) => Math.min(Math.max(0, current), maxIndex));
        publishFanOrigin(map, open);
      }
    }

    function applyItems(next: ScheduleMapItem[], animate: boolean) {
      syncMarkers(next);
      if (openClusterIdRef.current) return;
      applyCamera(map, next, animate);
    }
    applyItemsRef.current = applyItems;

    const projectOpen = () => {
      const cluster = findScheduleMapClusterByItemIds(
        clustersRef.current,
        openItemIdsRef.current ? openItemIdsRef.current.split("\0") : [],
      );
      if (!cluster) return;
      publishFanOrigin(map, cluster);
    };
    map.on("move", projectOpen);
    map.on("resize", projectOpen);

    const onLoad = () => {
      applyItems(itemsRef.current, itemsRef.current.length > 0);
    };

    if (map.loaded()) onLoad();
    else map.once("load", onLoad);

    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.off("move", projectOpen);
      map.off("resize", projectOpen);
      clearMarkers();
      map.remove();
      mapRef.current = null;
      applyItemsRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const applyItems = applyItemsRef.current;
    if (!map || !applyItems) return;
    applyItems(items, true);
  }, [items]);

  useEffect(() => {
    openClusterIdRef.current = openClusterId;
    for (const marker of markersRef.current) {
      const el = marker.getElement();
      if (!el.dataset.clusterId) continue;
      const open = el.dataset.clusterId === openClusterId;
      el.setAttribute("aria-expanded", open ? "true" : "false");
      el.style.opacity = open ? "0" : "1";
      el.style.pointerEvents = open ? "none" : "auto";
    }
    const map = mapRef.current;
    if (!map) return;
    if (openClusterId) {
      map.stop();
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.touchZoomRotate.disable();
      const cluster = findScheduleMapClusterByItemIds(
        clustersRef.current,
        openItemIds ? openItemIds.split("\0") : [],
      );
      if (cluster) publishFanOrigin(map, cluster);
      return;
    }
    map.dragPan.enable();
    map.scrollZoom.enable();
    map.touchZoomRotate.enable();
  }, [openClusterId, openItemIds]);

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
      {fanCluster && fanOrigin ? (
        <ScheduleMapFanOverlay
          cluster={fanCluster}
          index={fanIndex}
          origin={fanOrigin}
          canvas={canvasSize}
          unscheduled={t("unscheduled")}
          statusLabel={statusLabel}
          countAria={(count) => t("chestTasks", { count })}
          fanAria={(current, total, title, time, status) =>
            t("fanAria", { current, total, title, time, status })
          }
          onIndexChange={setFanIndex}
          onSelect={(item) => {
            onItemClick(item);
          }}
          onDismiss={closeFan}
        />
      ) : null}
    </div>
  );
}

function createClusterPin(
  cluster: ScheduleMapCluster<ScheduleMapItem>,
  labels: {
    unscheduled: string;
    moreItems: (title: string, count: number) => string;
    status: (status: string) => string;
    pinAria: (title: string, time: string, status: string, location: string) => string;
    pinClusterAria: (title: string, time: string, status: string, location: string, count: number) => string;
  },
) {
  const focus = scheduleMapClusterFocusIndex(cluster.items, new Date());
  const shown = [cluster.items[focus], ...cluster.items.filter((_, index) => index !== focus)];
  const copy = scheduleMapCardCopy(shown, labels, formatScheduleTimeRange);
  const item = shown[0];
  const colors = taskCalendarColors(item.priority);
  const background = isSettledCalendarStatus(item.status) ? desaturateHex(colors.bg) : colors.bg;
  const ariaLabel =
    copy.count > 1
      ? labels.pinClusterAria(copy.title, copy.timeLabel, copy.statusLabel, copy.locationLabel, copy.count)
      : labels.pinAria(copy.title, copy.timeLabel, copy.statusLabel, copy.locationLabel);
  return createScheduleMapPinElement({
    ...copy,
    accent: scheduleMapPinColor(item),
    background,
    foreground: colors.fg,
    ariaLabel,
  });
}
