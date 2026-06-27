"use client";

import type { CalendarWeekView } from "@/types/api/views/schedule";
import { CalendarTaskBar } from "./CalendarTaskBar";
import { dayKeyLocal } from "./taskUtils";
import type { ScheduleCalendarBodyProps } from "./ScheduleCalendar.types";
import { CALENDAR_LANE_GAP_PX, CALENDAR_LANE_HEIGHT_PX } from "./taskUtils";

const WEEK_LANE_HEIGHT_PX = CALENDAR_LANE_HEIGHT_PX + 4;

type Props = ScheduleCalendarBodyProps & {
  week: CalendarWeekView;
};

export function ScheduleCalendarWeek({
  week,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
}: Props) {
  const todayKey = dayKeyLocal(new Date());
  const maxLane = week.segments.reduce((m, s) => Math.max(m, s.lane), -1);
  const rowCount = maxLane < 0 ? 0 : maxLane + 1;
  const minTaskLanes = 2;
  const lanes = Math.max(rowCount, minTaskLanes);
  const taskAreaMinHeightPx =
    4 + 8 + lanes * WEEK_LANE_HEIGHT_PX + Math.max(0, lanes - 1) * CALENDAR_LANE_GAP_PX;

  return (
    <div className="border-b border-border-subtle flex flex-col min-h-0">
      <div className="grid grid-cols-7 shrink-0 border-t border-border-subtle bg-surface-container-lowest">
        {["日", "一", "二", "三", "四", "五", "六"].map((label) => (
          <div
            key={label}
            className="border-r border-border-subtle p-lg text-center font-overline text-neutral-muted last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 shrink-0">
        {week.days.map(({ key, day }, di) => {
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={[
                "border-r border-b border-border-subtle p-2 min-h-[44px]",
                di === 0 ? "border-l border-border-subtle" : "",
                isToday ? "bg-violet-200 ring-1 ring-violet-400 ring-inset z-[1]" : "bg-surface",
                "last:border-r-0",
              ].join(" ")}
            >
              <span className="font-small font-medium text-text-primary">{day}</span>
            </div>
          );
        })}
      </div>
      <div className="relative border-t border-border-subtle/70 bg-surface">
        <div
          className="relative z-[1] grid grid-cols-7 gap-x-0 gap-y-1 px-0 pb-2 pt-1"
          style={{
            gridAutoRows: WEEK_LANE_HEIGHT_PX,
            minHeight: taskAreaMinHeightPx,
          }}
        >
          {week.segments.map((seg) => (
            <div
              key={`week-${seg.item.id}-${seg.col_start}-${seg.lane}`}
              style={{
                gridColumn: `${seg.col_start} / span ${seg.col_span}`,
                gridRow: seg.lane + 1,
              }}
            >
              <CalendarTaskBar
                item={seg.item}
                showLabel={seg.round_left || seg.col_start === 1}
                roundLeft={seg.round_left}
                roundRight={seg.round_right}
                showProjectContext={showProjectContext}
                completingItemId={completingItemId}
                onTaskClick={onTaskClick}
                onCompleteTask={onCompleteTask}
              />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((col) => (
            <div
              key={col}
              className={[
                "border-r border-border-subtle",
                col === 0 ? "border-l border-border-subtle" : "",
                col === 6 ? "border-r-0" : "",
              ].join(" ")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
