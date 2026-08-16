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
  /** When false, header is rendered by the parent sticky shell. */
  showHeader?: boolean;
};

export function ScheduleCalendarDayHeader({
  day,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
  showAssigneeAvatar = false,
  dragItemId = null,
  onDragItemIdChange,
}: Pick<
  Props,
  | "day"
  | "onTaskClick"
  | "onCompleteTask"
  | "completingItemId"
  | "showProjectContext"
  | "showAssigneeAvatar"
  | "dragItemId"
  | "onDragItemIdChange"
>) {
  const { allDayItems } = splitDayItems(day.items, day.key);
  const dayOfMonth = parseDateAnchor(day.key).getDate();

  return (
    <>
      <div className="flex border-b border-border-subtle">
        <div className="w-14 shrink-0 border-r border-border-subtle bg-surface" aria-hidden />
        <div className="flex min-h-7 min-w-0 flex-1 items-center justify-between gap-1 px-1.5 py-1">
          <span className="truncate text-[10px] leading-4 text-neutral-muted">{lunarDateLabel(day.key)}</span>
          <span className="text-[11px] font-medium leading-4 text-text-primary">{dayOfMonth}</span>
        </div>
      </div>
      <div className="flex bg-violet-50/80">
        <div className="w-14 shrink-0 border-r border-border-subtle" aria-hidden />
        <div className="min-w-0 flex-1 px-2 py-1 text-center text-[10px] font-medium leading-4 text-neutral-muted">
          {weekdayLabel(day.key)}
        </div>
      </div>
      {/*
        日视图全天行仍不接 onDropDateTime（不能改期），但任务条可拖出到待添加任务。
      */}
      <CalendarAllDayRow
        columns={[{ key: day.key, items: allDayItems }]}
        onTaskClick={onTaskClick}
        onCompleteTask={onCompleteTask}
        completingItemId={completingItemId}
        showProjectContext={showProjectContext}
        showAssigneeAvatar={showAssigneeAvatar}
        dragItemId={dragItemId}
        onDragItemIdChange={onDragItemIdChange}
      />
    </>
  );
}

export function ScheduleCalendarDay({
  day,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
  showAssigneeAvatar = false,
  onDateBlankClick,
  dragItemId = null,
  dragOverDateKey = null,
  dragOverHour = null,
  onDragItemIdChange,
  onDragOverDateKeyChange,
  onDragOverHourChange,
  onDropDateTime,
  showHeader = true,
}: Props) {
  const { timedItems } = splitDayItems(day.items, day.key);
  const blocks = layoutDayTimeline(timedItems, day.key);
  const emptyLabel = onDateBlankClick ? "点击空白处添加任务" : "当天暂无任务";

  return (
    <div className="border-t border-border-subtle bg-surface">
      {showHeader ? (
        <div className="sticky top-0 z-20 shrink-0 bg-surface shadow-sm">
          <ScheduleCalendarDayHeader
            day={day}
            onTaskClick={onTaskClick}
            onCompleteTask={onCompleteTask}
            completingItemId={completingItemId}
            showProjectContext={showProjectContext}
            showAssigneeAvatar={showAssigneeAvatar}
            dragItemId={dragItemId}
            onDragItemIdChange={onDragItemIdChange}
          />
        </div>
      ) : null}
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
          dragItemId={dragItemId}
          dragOverDateKey={dragOverDateKey}
          dragOverHour={dragOverHour}
          onDragItemIdChange={onDragItemIdChange}
          onDragOverDateKeyChange={onDragOverDateKeyChange}
          onDragOverHourChange={onDragOverHourChange}
          onDropDateTime={onDropDateTime}
        />
      </div>
    </div>
  );
}
