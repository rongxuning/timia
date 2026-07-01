"use client";

import { useMemo } from "react";
import type { CalendarWeekView } from "@/types/api/views/schedule";
import { CalendarTimelineColumn } from "./CalendarTimelineColumn";
import { CalendarTimelineHourLabels } from "./CalendarTimelineHourLabels";
import { layoutDayTimeline } from "./calendarDayLayout";
import { weekItemsByDayKey } from "./calendarWeekLayout";
import { dayKeyLocal } from "./taskUtils";
import type { ScheduleCalendarBodyProps } from "./ScheduleCalendar.types";

type Props = ScheduleCalendarBodyProps & {
  week: CalendarWeekView;
};

export function ScheduleCalendarWeek({
  week,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
  showAssigneeAvatar = false,
  onDateBlankClick,
  onDateHeaderClick,
}: Props) {
  const todayKey = dayKeyLocal(new Date());
  const itemsByDay = useMemo(() => weekItemsByDayKey(week), [week]);

  return (
    <div className="border-b border-border-subtle flex flex-col min-h-0">
      <div className="flex shrink-0 border-t border-border-subtle bg-surface-container-lowest">
        <div className="w-14 shrink-0 border-r border-border-subtle" aria-hidden />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {["日", "一", "二", "三", "四", "五", "六"].map((label) => (
            <div
              key={label}
              className="border-r border-border-subtle p-lg text-center font-overline text-neutral-muted last:border-r-0"
            >
              {label}
            </div>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 border-b border-border-subtle">
        <div className="w-14 shrink-0 border-r border-border-subtle bg-surface" aria-hidden />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {week.days.map(({ key, day }) => {
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={[
                  "border-r border-border-subtle p-2 min-h-[44px]",
                  isToday ? "bg-violet-200 ring-1 ring-violet-400 ring-inset z-[1]" : "bg-surface",
                  "last:border-r-0",
                  onDateHeaderClick ? "cursor-pointer hover:bg-primary/5 transition-colors" : "",
                ].join(" ")}
                onClick={onDateHeaderClick ? () => onDateHeaderClick(key) : undefined}
                title={onDateHeaderClick ? "查看日视图" : undefined}
              >
                <span className="font-small font-medium text-text-primary">{day}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex border-t border-border-subtle bg-surface">
        <CalendarTimelineHourLabels />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {week.days.map((day) => {
            const items = itemsByDay.get(day.key) ?? [];
            const blocks = layoutDayTimeline(items, day.key);
            return (
              <CalendarTimelineColumn
                key={day.key}
                dayKey={day.key}
                blocks={blocks}
                onTaskClick={onTaskClick}
                onCompleteTask={onCompleteTask}
                completingItemId={completingItemId}
                showProjectContext={showProjectContext}
                showAssigneeAvatar={showAssigneeAvatar}
                onDateBlankClick={onDateBlankClick}
                compact
                bordered
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
