"use client";

import { DAY_TIMELINE_HEIGHT_PX, DAY_TIMELINE_HOUR_HEIGHT_PX } from "./calendarDayLayout";

export function CalendarTimelineHourLabels() {
  return (
    <div
      className="w-14 shrink-0 border-r border-border-subtle bg-surface-container-lowest/60"
      style={{ height: DAY_TIMELINE_HEIGHT_PX }}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className="relative border-b border-border-subtle/60 pr-1 text-right text-[10px] text-neutral-muted tabular-nums"
          style={{ height: DAY_TIMELINE_HOUR_HEIGHT_PX }}
        >
          <span className="absolute -top-2 right-1">{String(hour).padStart(2, "0")}:00</span>
        </div>
      ))}
    </div>
  );
}
