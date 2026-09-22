"use client";

import { useEffect, useRef, useState } from "react";
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
  SCHEDULE_MAP_FAN_CLOSE_MS,
  SCHEDULE_MAP_FAN_CLOSE_STAGGER_MS,
  SCHEDULE_MAP_FAN_OPEN_MS,
  SCHEDULE_MAP_FAN_OPEN_STAGGER_MS,
  SCHEDULE_MAP_FAN_SNAP_MS,
  applyScheduleMapFanDrag,
  isScheduleMapFanDismissFlick,
  isScheduleMapFanTap,
  scheduleMapFanCardOffset,
  scheduleMapFanCloseTotalMs,
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
  onCloseStart?: () => void;
  onSelect: (item: ScheduleMapItem) => void;
  onDismiss: () => void;
};

type FanMotion = "enter" | "drag" | "snap" | "close";

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
  onCloseStart,
  onSelect,
  onDismiss,
}: ScheduleMapFanOverlayProps) {
  const dragRef = useRef<{ x: number; y: number; t: number; index: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const [presented, setPresented] = useState(false);
  const [closing, setClosing] = useState(false);
  const [motion, setMotion] = useState<FanMotion>("enter");
  const layout = scheduleMapFanLayout(origin, canvas);
  const count = cluster.items.length;
  const center = Math.min(Math.max(0, count - 1), Math.max(0, Math.round(index)));
  const flying = presented && !closing;

  useEffect(() => {
    rootRef.current?.focus();
    closingRef.current = false;
    setClosing(false);
    setPresented(false);
    setMotion("enter");
    const frame = requestAnimationFrame(() => setPresented(true));
    return () => cancelAnimationFrame(frame);
  }, [cluster.id]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  function finishClose(action: () => void) {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setMotion("close");
    onCloseStart?.();
    const wait = scheduleMapFanCloseTotalMs(count);
    closeTimerRef.current = window.setTimeout(action, wait);
  }

  function endPointer(event: PointerEvent | React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || closingRef.current) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const dt = Math.max(1, event.timeStamp - drag.t);
    const vx = (dx / dt) * 1000;
    const vy = (dy / dt) * 1000;
    if (isScheduleMapFanDismissFlick(vx, vy)) {
      finishClose(onDismiss);
      return;
    }
    if (isScheduleMapFanTap(dx, dy, Math.hypot(vx, vy))) {
      const target = event.target;
      const button = target instanceof HTMLElement ? target.closest("[data-fan-index]") : null;
      const tapped = Number(button?.getAttribute("data-fan-index"));
      if (Number.isInteger(tapped) && tapped === center) {
        const selected = cluster.items[center];
        if (selected) finishClose(() => onSelect(selected));
        return;
      }
      if (Number.isInteger(tapped)) {
        setMotion("snap");
        onIndexChange(tapped);
        return;
      }
      finishClose(onDismiss);
      return;
    }
    setMotion("snap");
    onIndexChange(
      snapScheduleMapFanIndex(
        applyScheduleMapFanDrag(drag.index, dx, cluster.items.length),
        vx,
        cluster.items.length,
      ),
    );
  }

  const labelTop = layout.direction === 1 ? SCHEDULE_MAP_FAN_CARD_HEIGHT + 8 : -SCHEDULE_MAP_FAN_CARD_HEIGHT;
  const labelTransform = layout.direction === 1 ? "translate(-50%, 0)" : "translate(-50%, -100%)";

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="dialog"
      aria-modal="true"
      className="pointer-events-auto absolute inset-0 z-20 outline-none"
      onPointerDown={(event) => {
        if (closingRef.current) return;
        if (event.target === event.currentTarget) {
          finishClose(onDismiss);
          return;
        }
        dragRef.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, index };
        setMotion("drag");
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || closingRef.current) return;
        onIndexChange(applyScheduleMapFanDrag(drag.index, event.clientX - drag.x, cluster.items.length));
      }}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onKeyDown={(event) => {
        if (closingRef.current) return;
        if (event.key === "Escape") finishClose(onDismiss);
        if (event.key === "ArrowLeft") {
          setMotion("snap");
          onIndexChange(Math.max(0, center - 1));
        }
        if (event.key === "ArrowRight") {
          setMotion("snap");
          onIndexChange(Math.min(cluster.items.length - 1, center + 1));
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const selected = cluster.items[center];
          if (selected) finishClose(() => onSelect(selected));
        }
      }}
    >
      <div
        className="pointer-events-none absolute"
        style={{ left: origin.x + layout.shiftX, top: origin.y }}
      >
        <div
          className="pointer-events-none absolute text-center text-caption text-text-secondary"
          style={{ left: 0, top: labelTop, transform: labelTransform }}
        >
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
          const point = scheduleMapFanCardOffset(itemIndex - index, layout);
          const duration =
            motion === "close" ? SCHEDULE_MAP_FAN_CLOSE_MS : motion === "snap" ? SCHEDULE_MAP_FAN_SNAP_MS : SCHEDULE_MAP_FAN_OPEN_MS;
          const delay =
            motion === "close"
              ? (count - 1 - itemIndex) * SCHEDULE_MAP_FAN_CLOSE_STAGGER_MS
              : motion === "enter"
                ? itemIndex * SCHEDULE_MAP_FAN_OPEN_STAGGER_MS
                : 0;
          const easing = motion === "close" ? "ease-in" : "ease-out";
          const transition =
            motion === "drag"
              ? "none"
              : `left ${duration}ms ${easing} ${delay}ms, top ${duration}ms ${easing} ${delay}ms, transform ${duration}ms ${easing} ${delay}ms, opacity ${duration}ms ${easing} ${delay}ms`;
          return (
            <button
              key={item.id}
              type="button"
              data-fan-index={itemIndex}
              aria-label={fanAria(itemIndex + 1, cluster.items.length, item.title, time, status)}
              className="pointer-events-auto absolute w-[200px] rounded-xl border px-3 py-2 text-left shadow-sm"
              style={{
                left: flying ? point.x : 0,
                top: flying ? point.y : 0,
                transform: `translate(-50%, 0) rotate(${flying ? slot.rotate * layout.direction : 0}deg) scale(${flying ? slot.scale : 0.92})`,
                opacity: flying ? slot.opacity : 0,
                zIndex: 20 - Math.round(Math.abs(itemIndex - index) * 10),
                background,
                color: colors.fg,
                borderColor: scheduleMapPinColor(item),
                borderLeftWidth: 3,
                transition,
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
