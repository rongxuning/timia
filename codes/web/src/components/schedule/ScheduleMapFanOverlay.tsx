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
  SCHEDULE_MAP_CARD_HEIGHT,
  SCHEDULE_MAP_CARD_WIDTH,
  SCHEDULE_MAP_FAN_CLOSE_MS,
  SCHEDULE_MAP_FAN_OPEN_MS,
  SCHEDULE_MAP_FAN_SNAP_MS,
  SCHEDULE_MAP_REEL_GAP,
  SCHEDULE_MAP_REEL_STEP_PX,
  SCHEDULE_MAP_REEL_TILE,
  applyScheduleMapFanDrag,
  isScheduleMapFanTap,
  scheduleMapReelHitFromElement,
  scheduleMapReelSide,
  scheduleMapReelSlot,
  snapScheduleMapFanIndex,
} from "@/lib/scheduleMapFan";
import { scheduleMapCountDisplay } from "@/lib/scheduleMapPins";

type ScheduleMapFanOverlayProps = {
  cluster: ScheduleMapCluster<ScheduleMapItem>;
  index: number;
  origin: { x: number; y: number };
  canvas: { width: number; height: number };
  unscheduled: string;
  statusLabel: (status: string) => string;
  countAria: (count: number) => string;
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
  unscheduled,
  statusLabel,
  countAria,
  fanAria,
  onIndexChange,
  onSelect,
  onDismiss,
}: ScheduleMapFanOverlayProps) {
  const dragRef = useRef<{ x: number; y: number; t: number; index: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [motion, setMotion] = useState<"enter" | "drag" | "snap">("enter");
  const count = cluster.items.length;
  const center = Math.min(Math.max(0, count - 1), Math.max(0, Math.round(index)));
  const selected = cluster.items[center];
  const side = scheduleMapReelSide(origin.x, canvas.width);
  const cardHalf = SCHEDULE_MAP_CARD_WIDTH / 2;
  const reelCenterX =
    side === "left"
      ? -(cardHalf + SCHEDULE_MAP_REEL_GAP + SCHEDULE_MAP_REEL_TILE / 2)
      : cardHalf + SCHEDULE_MAP_REEL_GAP + SCHEDULE_MAP_REEL_TILE / 2;
  const cardTop = -(SCHEDULE_MAP_CARD_HEIGHT + 4);
  const cardMidY = cardTop + SCHEDULE_MAP_CARD_HEIGHT / 2;

  useEffect(() => {
    rootRef.current?.focus();
    setMotion("enter");
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
    if (isScheduleMapFanTap(dx, dy, Math.hypot(vx, vy))) {
      // Pointer capture retargets event.target to the overlay; hit-test the point instead.
      const underPoint = document.elementFromPoint(event.clientX, event.clientY);
      const hit = scheduleMapReelHitFromElement(underPoint);
      if (hit?.action === "open" && selected) {
        onSelect(selected);
        return;
      }
      if (hit?.action === "focus") {
        setMotion("snap");
        onIndexChange(hit.index);
        return;
      }
      onDismiss();
      return;
    }
    setMotion("snap");
    onIndexChange(
      snapScheduleMapFanIndex(applyScheduleMapFanDrag(drag.index, dy, count, SCHEDULE_MAP_REEL_STEP_PX), vy, count),
    );
  }

  const selectedColors = selected ? taskCalendarColors(selected.priority) : null;
  const selectedTime = selected
    ? formatScheduleTimeRange(selected.start_at, selected.end_at) ?? unscheduled
    : "";
  const selectedStatus = selected ? statusLabel(selected.status) : "";
  const badge = scheduleMapCountDisplay(count);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="dialog"
      aria-modal="true"
      className="pointer-events-auto absolute inset-0 z-20 outline-none"
      style={{ touchAction: "none" }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onDismiss();
          return;
        }
        dragRef.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, index };
        setMotion("drag");
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag) return;
        onIndexChange(applyScheduleMapFanDrag(drag.index, event.clientY - drag.y, count, SCHEDULE_MAP_REEL_STEP_PX));
      }}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDismiss();
        if (event.key === "ArrowUp") {
          setMotion("snap");
          onIndexChange(Math.max(0, center - 1));
        }
        if (event.key === "ArrowDown") {
          setMotion("snap");
          onIndexChange(Math.min(count - 1, center + 1));
        }
        if ((event.key === "Enter" || event.key === " ") && selected) {
          event.preventDefault();
          onSelect(selected);
        }
      }}
    >
      <div className="pointer-events-none absolute" style={{ left: origin.x, top: origin.y }}>
        {cluster.items.map((item, itemIndex) => {
          const slot = scheduleMapReelSlot(itemIndex - index);
          if (!slot) return null;
          const colors = taskCalendarColors(item.priority);
          const background = isSettledCalendarStatus(item.status)
            ? desaturateHex(colors.bg)
            : colors.bg;
          const time = formatScheduleTimeRange(item.start_at, item.end_at) ?? unscheduled;
          const status = statusLabel(item.status);
          const duration = motion === "snap" ? SCHEDULE_MAP_FAN_SNAP_MS : SCHEDULE_MAP_FAN_OPEN_MS;
          return (
            <button
              key={item.id}
              type="button"
              data-reel-action="focus"
              data-fan-index={itemIndex}
              aria-label={fanAria(itemIndex + 1, count, item.title, time, status)}
              className="pointer-events-auto absolute overflow-hidden rounded-[18px] border px-1.5 py-1.5 text-left shadow-sm"
              style={{
                left: reelCenterX,
                top: cardMidY + slot.y,
                width: SCHEDULE_MAP_REEL_TILE,
                height: SCHEDULE_MAP_REEL_TILE,
                transform: `translate(-50%, -50%) scale(${slot.scale})`,
                opacity: slot.opacity,
                zIndex: 10 - Math.round(Math.abs(itemIndex - index) * 10),
                background,
                color: colors.fg,
                borderColor: scheduleMapPinColor(item),
                transition: motion === "drag" ? "none" : `top ${duration}ms ease-out, transform ${duration}ms ease-out, opacity ${duration}ms ease-out`,
              }}
            >
              <div className="truncate text-[11px] font-semibold leading-tight">{item.title}</div>
              <div className="mt-0.5 truncate text-[10px] leading-tight" style={{ opacity: 0.82 }}>
                {time}
              </div>
            </button>
          );
        })}

        {selected && selectedColors ? (
          <button
            type="button"
            data-reel-action="open"
            aria-label={fanAria(center + 1, count, selected.title, selectedTime, selectedStatus)}
            className="pointer-events-auto absolute box-border overflow-hidden rounded-xl border px-3 py-2 text-left shadow-sm"
            style={{
              left: 0,
              top: cardTop,
              width: SCHEDULE_MAP_CARD_WIDTH,
              height: SCHEDULE_MAP_CARD_HEIGHT,
              transform: "translate(-50%, 0)",
              zIndex: 30,
              background: isSettledCalendarStatus(selected.status)
                ? desaturateHex(selectedColors.bg)
                : selectedColors.bg,
              color: selectedColors.fg,
              borderColor: scheduleMapPinColor(selected),
              borderLeftWidth: 3,
              transition: motion === "drag" ? "none" : `opacity ${SCHEDULE_MAP_FAN_CLOSE_MS}ms ease-out`,
            }}
          >
            {badge ? (
              <span
                className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-primary px-1 text-[11px] font-semibold leading-none text-white"
                aria-label={countAria(count)}
              >
                {badge}
              </span>
            ) : null}
            <div className="truncate text-small font-semibold">{selected.title}</div>
            <div className="mt-0.5 truncate text-caption" style={{ opacity: 0.82 }}>
              {selectedTime}
            </div>
            <div className="truncate text-caption" style={{ opacity: 0.82 }}>
              {selectedStatus}
            </div>
            {selected.location?.trim() ? (
              <div className="truncate text-caption" style={{ opacity: 0.82 }}>
                {selected.location.trim()}
              </div>
            ) : null}
          </button>
        ) : null}

        <span
          aria-hidden="true"
          className="absolute left-0 top-0 block h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white"
          style={{
            background: selected ? scheduleMapPinColor(selected) : "var(--color-primary, #4f46e5)",
            boxShadow: "0 1px 3px rgb(15 23 42 / 0.28)",
          }}
        />
      </div>
    </div>
  );
}
