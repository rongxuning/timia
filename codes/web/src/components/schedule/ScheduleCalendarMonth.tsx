"use client";

import { type DragEvent } from "react";
import type { CalendarWeekView } from "@/types/api/views/schedule";
import { CalendarDateBlankColumns } from "./CalendarDateBlankColumns";
import { CalendarTaskBar } from "./CalendarTaskBar";
import { lunarDateLabel } from "./calendarNav";
import { dayKeyLocal } from "./taskUtils";
import type { ScheduleCalendarBodyProps } from "./ScheduleCalendar.types";
import { CALENDAR_LANE_GAP_PX, CALENDAR_LANE_HEIGHT_PX } from "./taskUtils";

type Props = ScheduleCalendarBodyProps & {
  weeks: CalendarWeekView[];
};

export function ScheduleCalendarMonth({
  weeks,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
  showAssigneeAvatar = false,
  onDateBlankClick,
  onDateHeaderClick,
  dragItemId = null,
  dragOverDateKey = null,
  onDragItemIdChange,
  onDragOverDateKeyChange,
  onDropDateTime,
  reschedulingItemId = null,
}: Props) {
  const todayKey = dayKeyLocal(new Date());
  const draggable = !!onDragItemIdChange;
  const droppable = !!onDropDateTime;

  function handleDateKeyDragOver(e: DragEvent<HTMLElement>, key: string) {
    if (!droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDateKey !== key) onDragOverDateKeyChange?.(key);
  }

  function handleDateKeyDragLeave(e: DragEvent<HTMLElement>) {
    if (!droppable) return;
    if (e.currentTarget !== e.target) return;
    onDragOverDateKeyChange?.(null);
  }

  function handleDateKeyDrop(e: DragEvent<HTMLElement>, key: string) {
    if (!droppable || !onDropDateTime) return;
    e.preventDefault();
    const id = e.dataTransfer.getData("text/task-id") || dragItemId;
    onDragItemIdChange?.(null);
    onDragOverDateKeyChange?.(null);
    if (!id) return;
    onDropDateTime(id, { dateKey: key, hour: null });
  }

  return (
    <div className="flex flex-col">
      {weeks.map((week, wi) => {
        const maxLane = week.segments.reduce((m, s) => Math.max(m, s.lane), -1);
        const rowCount = maxLane < 0 ? 0 : maxLane + 1;
        const minTaskLanes = 3;
        const lanes = Math.max(rowCount + 1, minTaskLanes);
        const taskAreaMinHeightPx =
          4 + 8 + lanes * CALENDAR_LANE_HEIGHT_PX + Math.max(0, lanes - 1) * CALENDAR_LANE_GAP_PX;
        return (
          <div key={wi} className="border-b border-border-subtle last:border-b-0 flex flex-col min-h-0">
            <div className="grid grid-cols-7 shrink-0">
              {week.days.map(({ key, day, in_month }, di) => {
                const isToday = key === todayKey;
                const isDragOver = draggable && dragOverDateKey === key;
                return (
                  <div
                    key={key}
                    className={[
                      "min-h-7 border-r border-b border-border-subtle px-1.5 py-1",
                      di === 0 ? "border-l border-border-subtle" : "",
                      in_month ? "bg-surface" : "bg-surface-container-low/60 text-neutral-muted",
                      isToday ? "bg-violet-200 ring-1 ring-violet-400 ring-inset z-[1]" : "",
                      "last:border-r-0",
                      onDateHeaderClick ? "cursor-pointer hover:bg-primary/5 transition-colors" : "",
                      isDragOver ? "bg-primary/15" : "",
                      !in_month ? (isDragOver ? "" : "opacity-60") : "",
                    ].join(" ")}
                    onClick={onDateHeaderClick ? () => onDateHeaderClick(key) : undefined}
                    onDragOver={droppable ? (e) => handleDateKeyDragOver(e, key) : undefined}
                    onDragLeave={droppable ? handleDateKeyDragLeave : undefined}
                    onDrop={droppable ? (e) => handleDateKeyDrop(e, key) : undefined}
                    title={onDateHeaderClick ? "查看日视图" : undefined}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-1">
                      <span className="truncate text-[10px] leading-4 text-neutral-muted">
                        {lunarDateLabel(key)}
                      </span>
                      <span className={in_month ? "text-[11px] font-medium leading-4 text-text-primary" : "text-[11px] leading-4"}>
                        {day}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="relative border-t border-border-subtle/70 bg-surface">
              <div
                className="relative z-[1] grid grid-cols-7 gap-x-0 gap-y-1 px-0 pb-2 pt-1 pointer-events-none"
                style={{
                  gridAutoRows: CALENDAR_LANE_HEIGHT_PX,
                  minHeight: taskAreaMinHeightPx,
                }}
              >
                {week.segments.map((seg) => (
                  <div
                    key={`cal-${seg.item.id}-${wi}-${seg.col_start}-${seg.lane}`}
                    className="pointer-events-auto"
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
                      showAssigneeAvatar={showAssigneeAvatar}
                      completingItemId={completingItemId}
                      onTaskClick={onTaskClick}
                      onCompleteTask={onCompleteTask}
                      draggable={draggable && seg.item.status !== "archived" && seg.item.id !== reschedulingItemId}
                      onDragStart={
                        onDragItemIdChange
                          ? (it) => onDragItemIdChange(it.id)
                          : undefined
                      }
                      onDragEnd={onDragItemIdChange ? () => onDragItemIdChange(null) : undefined}
                      isDragging={dragItemId === seg.item.id}
                    />
                  </div>
                ))}
              </div>
              <CalendarDateBlankColumns
                dateKeys={week.days.map((d) => d.key)}
                onDateBlankClick={onDateBlankClick}
                dragItemId={dragItemId}
                dragOverDateKey={dragOverDateKey}
                onDragOverDateKeyChange={onDragOverDateKeyChange}
                onDropDateTime={onDropDateTime}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
