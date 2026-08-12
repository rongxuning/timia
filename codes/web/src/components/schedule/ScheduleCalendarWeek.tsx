"use client";

import { useMemo } from "react";
import type { CalendarWeekView } from "@/types/api/views/schedule";
import { CalendarAllDayRow } from "./CalendarAllDayRow";
import { CalendarTimelineColumn } from "./CalendarTimelineColumn";
import { CalendarTimelineHourLabels } from "./CalendarTimelineHourLabels";
import { lunarDateLabel, weekdayLabel } from "./calendarNav";
import { layoutDayTimeline, splitDayItems } from "./calendarDayLayout";
import { weekItemsByDayKey } from "./calendarWeekLayout";
import { dayKeyLocal } from "./taskUtils";
import type { ScheduleCalendarBodyProps } from "./ScheduleCalendar.types";

type Props = ScheduleCalendarBodyProps & {
  week: CalendarWeekView;
  /** When false, header is rendered by the parent sticky shell. */
  showHeader?: boolean;
};

function useWeekDayItems(week: CalendarWeekView) {
  const itemsByDay = useMemo(() => weekItemsByDayKey(week), [week]);
  return useMemo(
    () =>
      week.days.map((day) => ({
        key: day.key,
        ...splitDayItems(itemsByDay.get(day.key) ?? [], day.key),
      })),
    [itemsByDay, week.days],
  );
}

export function ScheduleCalendarWeekHeader({
  week,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
  showAssigneeAvatar = false,
  onDateHeaderClick,
  dragItemId = null,
  dragOverDateKey = null,
  onDragItemIdChange,
  onDragOverDateKeyChange,
  onDropDateTime,
}: Omit<Props, "showHeader">) {
  const todayKey = dayKeyLocal(new Date());
  const dayItems = useWeekDayItems(week);

  return (
    <>
      <div className="flex border-t border-b border-border-subtle">
        <div className="w-14 shrink-0 border-r border-border-subtle bg-surface" aria-hidden />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {week.days.map(({ key, day }) => {
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className={[
                  "min-h-7 border-r border-border-subtle px-1.5 py-1",
                  isToday ? "bg-violet-200 ring-1 ring-violet-400 ring-inset z-[1]" : "bg-surface",
                  "last:border-r-0",
                  onDateHeaderClick ? "cursor-pointer hover:bg-primary/5 transition-colors" : "",
                ].join(" ")}
                onClick={onDateHeaderClick ? () => onDateHeaderClick(key) : undefined}
                title={onDateHeaderClick ? "查看日视图" : undefined}
              >
                <div className="flex min-w-0 items-center justify-between gap-1">
                  <span className="truncate text-[10px] leading-4 text-neutral-muted">{lunarDateLabel(key)}</span>
                  <span className="text-[11px] font-medium leading-4 text-text-primary">{day}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex bg-violet-50/80">
        <div className="w-14 shrink-0 border-r border-border-subtle" aria-hidden />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {week.days.map(({ key }) => (
            <div
              key={key}
              className="border-r border-border-subtle px-2 py-1 text-center text-[10px] font-medium leading-4 text-neutral-muted last:border-r-0"
            >
              {weekdayLabel(key)}
            </div>
          ))}
        </div>
      </div>
      <CalendarAllDayRow
        columns={dayItems.map(({ key, allDayItems }) => ({ key, items: allDayItems }))}
        onTaskClick={onTaskClick}
        onCompleteTask={onCompleteTask}
        completingItemId={completingItemId}
        showProjectContext={showProjectContext}
        showAssigneeAvatar={showAssigneeAvatar}
        dragItemId={dragItemId}
        dragOverDateKey={dragOverDateKey}
        onDragItemIdChange={onDragItemIdChange}
        onDragOverDateKeyChange={onDragOverDateKeyChange}
        onDropDateTime={onDropDateTime}
      />
    </>
  );
}

export function ScheduleCalendarWeek({
  week,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
  showAssigneeAvatar = false,
  onDateBlankClick,
  onDateHeaderClick,
  dragItemId = null,
  dragOverDateKey = null,
  dragOverHour = null,
  onDragItemIdChange,
  onDragOverDateKeyChange,
  onDragOverHourChange,
  onDropDateTime,
  showHeader = true,
}: Props) {
  const dayItems = useWeekDayItems(week);

  return (
    <div className="border-b border-border-subtle flex flex-col min-h-0">
      {showHeader ? (
        <div className="sticky top-0 z-20 shrink-0 bg-surface shadow-sm">
          <ScheduleCalendarWeekHeader
            week={week}
            onTaskClick={onTaskClick}
            onCompleteTask={onCompleteTask}
            completingItemId={completingItemId}
            showProjectContext={showProjectContext}
            showAssigneeAvatar={showAssigneeAvatar}
            onDateHeaderClick={onDateHeaderClick}
            dragItemId={dragItemId}
            dragOverDateKey={dragOverDateKey}
            onDragItemIdChange={onDragItemIdChange}
            onDragOverDateKeyChange={onDragOverDateKeyChange}
            onDropDateTime={onDropDateTime}
          />
        </div>
      ) : null}
      <div className="flex border-t border-border-subtle bg-surface pt-2">
        <CalendarTimelineHourLabels />
        <div className="grid min-w-0 flex-1 grid-cols-7">
          {dayItems.map((day) => {
            const blocks = layoutDayTimeline(day.timedItems, day.key);
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
                dragItemId={dragItemId}
                dragOverDateKey={dragOverDateKey}
                dragOverHour={dragOverHour}
                onDragItemIdChange={onDragItemIdChange}
                onDragOverDateKeyChange={onDragOverDateKeyChange}
                onDragOverHourChange={onDragOverHourChange}
                onDropDateTime={onDropDateTime}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
