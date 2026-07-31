"use client";

import type { CalendarDayDetailView } from "@/types/api/views/schedule";
import { CalendarAllDayRow } from "./CalendarAllDayRow";
import { CalendarTimelineColumn } from "./CalendarTimelineColumn";
import { CalendarTimelineHourLabels } from "./CalendarTimelineHourLabels";
import { lunarDateLabel, parseDateAnchor, weekdayLabel } from "./calendarNav";
import { layoutDayTimeline, splitDayItems } from "./calendarDayLayout";
import type { ScheduleCalendarBodyProps } from "./ScheduleCalendar.types";

type Props = ScheduleCalendarBodyProps & {
  day: CalendarDayDetailView;
};

export function ScheduleCalendarDay({
  day,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
  showAssigneeAvatar = false,
  onDateBlankClick,
}: Props) {
  const { allDayItems, timedItems } = splitDayItems(day.items, day.key);
  const blocks = layoutDayTimeline(timedItems, day.key);
  const emptyLabel = onDateBlankClick ? "点击空白处添加任务" : "当天暂无任务";
  const dayOfMonth = parseDateAnchor(day.key).getDate();

  return (
    <div className="border-t border-border-subtle bg-surface">
      <div className="sticky top-0 z-20 shrink-0 bg-surface shadow-sm">
        <div className="flex border-b border-border-subtle">
          <div className="w-14 shrink-0 border-r border-border-subtle bg-surface" aria-hidden />
          <div className="flex min-h-7 min-w-0 flex-1 items-center justify-between gap-1 px-1.5 py-1">
            <span className="truncate text-[10px] leading-4 text-neutral-muted">
              {lunarDateLabel(day.key)}
            </span>
            <span className="text-[11px] font-medium leading-4 text-text-primary">{dayOfMonth}</span>
          </div>
        </div>
        <div className="flex bg-violet-50/80">
          <div className="w-14 shrink-0 border-r border-border-subtle" aria-hidden />
          <div className="min-w-0 flex-1 px-2 py-1 text-center text-[10px] font-medium leading-4 text-neutral-muted">
            {weekdayLabel(day.key)}
          </div>
        </div>
        <CalendarAllDayRow
          columns={[{ key: day.key, items: allDayItems }]}
          onTaskClick={onTaskClick}
          onCompleteTask={onCompleteTask}
          completingItemId={completingItemId}
          showProjectContext={showProjectContext}
          showAssigneeAvatar={showAssigneeAvatar}
        />
      </div>
      <div className="flex bg-surface pt-2">
        <CalendarTimelineHourLabels />
        <CalendarTimelineColumn
          dayKey={day.key}
          blocks={blocks}
          onTaskClick={onTaskClick}
          onCompleteTask={onCompleteTask}
          completingItemId={completingItemId}
          showProjectContext={showProjectContext}
          showAssigneeAvatar={showAssigneeAvatar}
          onDateBlankClick={onDateBlankClick}
          compact
          laneLayout="grid-slot"
          emptyLabel={blocks.length === 0 ? emptyLabel : undefined}
        />
      </div>
    </div>
  );
}
