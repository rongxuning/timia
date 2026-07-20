"use client";

import type { CalendarDayDetailView } from "@/types/api/views/schedule";
import { CalendarAllDayRow } from "./CalendarAllDayRow";
import { CalendarTimelineColumn } from "./CalendarTimelineColumn";
import { CalendarTimelineHourLabels } from "./CalendarTimelineHourLabels";
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

  return (
    <div className="border-t border-border-subtle bg-surface">
      <CalendarAllDayRow
        columns={[{ key: day.key, items: allDayItems }]}
        onTaskClick={onTaskClick}
        onCompleteTask={onCompleteTask}
        completingItemId={completingItemId}
        showProjectContext={showProjectContext}
        showAssigneeAvatar={showAssigneeAvatar}
      />
      <div className="flex">
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
