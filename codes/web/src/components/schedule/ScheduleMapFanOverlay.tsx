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
  const count = cluster.items.length;
  const center = Math.min(Math.max(0, count - 1), Math.max(0, Math.round(index)));

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
        const selected = cluster.items[center];
        if (selected) onSelect(selected);
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
          const selected = cluster.items[center];
          if (selected) onSelect(selected);
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
              className="absolute w-[200px] rounded-xl border px-3 py-2 text-left shadow-sm"
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
