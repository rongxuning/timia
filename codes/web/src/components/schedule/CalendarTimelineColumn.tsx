"use client";

import { type DragEvent } from "react";
import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { calendarTaskTooltip } from "./CalendarTaskBar";
import { CalendarTaskCard } from "./CalendarTaskCard";
import type { DayTimelineBlock } from "./calendarDayLayout";
import { DAY_TIMELINE_HEIGHT_PX, DAY_TIMELINE_HOUR_HEIGHT_PX } from "./calendarDayLayout";
import {
  CALENDAR_TASK_CARD_HEIGHT_PX,
  computeRescheduledRange,
  formatFloatHour,
  snapYTo15Min,
  taskCalendarColors,
  taskLabelStripeColor,
} from "./taskUtils";

type Props = {
  dayKey: string;
  blocks: DayTimelineBlock[];
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
  /** Kept for API stability; CalendarTaskCard always shows avatar/? */
  showAssigneeAvatar?: boolean;
  onDateBlankClick?: (dateKey: string, hour?: number) => void;
  compact?: boolean;
  bordered?: boolean;
  emptyLabel?: string;
  /** 日视图：同时间段任务各占一列网格宽度并横向排列；默认在列内按 lane 分割宽度 */
  laneLayout?: "column-split" | "grid-slot";
  /** 拖拽改期相关：与日历其它组件共享 */
  dragItemId?: string | null;
  dragOverDateKey?: string | null;
  dragOverHour?: number | null;
  onDragItemIdChange?: (id: string | null) => void;
  onDragOverDateKeyChange?: (key: string | null) => void;
  onDragOverHourChange?: (hour: number | null) => void;
  onDropDateTime?: (taskId: string, target: { dateKey: string; hour: number | null }) => void;
};

export function CalendarTimelineColumn({
  dayKey,
  blocks,
  onTaskClick,
  onCompleteTask,
  completingItemId = null,
  showProjectContext = true,
  showAssigneeAvatar: _showAssigneeAvatar = false,
  onDateBlankClick,
  compact = false,
  bordered = false,
  emptyLabel,
  laneLayout = "column-split",
  dragItemId = null,
  dragOverDateKey = null,
  dragOverHour = null,
  onDragItemIdChange,
  onDragOverDateKeyChange,
  onDragOverHourChange,
  onDropDateTime,
}: Props) {
  const isGridSlot = laneLayout === "grid-slot";
  const gridColWidthPct = 100 / 7;
  const droppable = !!onDropDateTime;

  function snapHourFromY(y: number): number {
    return snapYTo15Min(y, DAY_TIMELINE_HOUR_HEIGHT_PX);
  }

  function handleTimelineBlankClick(e: React.MouseEvent<HTMLElement>) {
    if (!onDateBlankClick) return;
    if ((e.target as HTMLElement).closest("[role='button']")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.min(23, Math.max(0, Math.floor(y / DAY_TIMELINE_HOUR_HEIGHT_PX)));
    onDateBlankClick(dayKey, hour);
  }

  function handleHourDragOver(e: DragEvent<HTMLButtonElement>, buttonHour: number) {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const yInButton = e.clientY - rect.top;
    const hour = Math.min(
      24,
      Math.max(
        0,
        snapYTo15Min(buttonHour * DAY_TIMELINE_HOUR_HEIGHT_PX + yInButton, DAY_TIMELINE_HOUR_HEIGHT_PX),
      ),
    );
    if (dragOverDateKey !== dayKey) onDragOverDateKeyChange?.(dayKey);
    if (dragOverHour !== hour) onDragOverHourChange?.(hour);
  }

  /**
   * 列级 dragover：覆盖 column-split 模式（周视图）下小时槽是 pointer-events-none 的情况。
   * 光标位置即"卡片上边缘"（dragstart 用 setDragImage(0,0) 锁住）。
   */
  function handleColumnDragOver(e: DragEvent<HTMLDivElement>) {
    if (!droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = snapHourFromY(y);
    if (dragOverDateKey !== dayKey) onDragOverDateKeyChange?.(dayKey);
    if (dragOverHour !== hour) onDragOverHourChange?.(hour);
  }

  function handleColumnDrop(e: DragEvent<HTMLDivElement>) {
    if (!droppable || !onDropDateTime) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = snapHourFromY(y);
    const id = e.dataTransfer.getData("text/task-id") || dragItemId;
    onDragItemIdChange?.(null);
    onDragOverDateKeyChange?.(null);
    onDragOverHourChange?.(null);
    if (!id) return;
    onDropDateTime(id, { dateKey: dayKey, hour });
  }

  function handleHourDragLeave(e: DragEvent<HTMLButtonElement>) {
    if (!droppable) return;
    if (e.currentTarget !== e.target) return;
    if (dragOverDateKey === dayKey) onDragOverDateKeyChange?.(null);
    onDragOverHourChange?.(null);
  }

  function handleHourDrop(e: DragEvent<HTMLButtonElement>, buttonHour: number) {
    if (!droppable || !onDropDateTime) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const yInButton = e.clientY - rect.top;
    const hour = Math.min(
      24,
      Math.max(
        0,
        snapYTo15Min(buttonHour * DAY_TIMELINE_HOUR_HEIGHT_PX + yInButton, DAY_TIMELINE_HOUR_HEIGHT_PX),
      ),
    );
    const id = e.dataTransfer.getData("text/task-id") || dragItemId;
    onDragItemIdChange?.(null);
    onDragOverDateKeyChange?.(null);
    onDragOverHourChange?.(null);
    if (!id) return;
    onDropDateTime(id, { dateKey: dayKey, hour });
  }

  return (
    <div
      className={[
        "relative min-w-0",
        bordered && !isGridSlot ? "border-r border-border-subtle last:border-r-0" : "",
        onDateBlankClick ? "cursor-pointer" : "",
        isGridSlot ? "flex-1" : "",
      ].join(" ")}
      style={{ height: DAY_TIMELINE_HEIGHT_PX }}
      onClick={onDateBlankClick && !isGridSlot ? handleTimelineBlankClick : undefined}
      onDragOver={droppable ? handleColumnDragOver : undefined}
      onDrop={droppable ? handleColumnDrop : undefined}
      title={onDateBlankClick && !isGridSlot ? "点击空白处添加任务" : undefined}
    >
      {Array.from({ length: 24 }, (_, hour) => {
        const isHovered =
          droppable &&
          dragOverDateKey === dayKey &&
          dragOverHour != null &&
          Math.floor(dragOverHour) === hour;
        return (
          <button
            key={hour}
            type="button"
            className={[
              "absolute left-0 right-0 border-b border-border-subtle/50 transition-colors",
              isGridSlot && onDateBlankClick
                ? "z-0 text-left hover:bg-violet-50/50 focus-visible:z-[2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                : "pointer-events-none",
              isHovered ? "bg-primary/15" : "",
            ].join(" ")}
            style={{ top: hour * DAY_TIMELINE_HOUR_HEIGHT_PX, height: DAY_TIMELINE_HOUR_HEIGHT_PX }}
            onClick={isGridSlot && onDateBlankClick ? () => onDateBlankClick(dayKey, hour) : undefined}
            onDragOver={(e) => handleHourDragOver(e, hour)}
            onDragLeave={handleHourDragLeave}
            onDrop={(e) => handleHourDrop(e, hour)}
            title={isGridSlot && onDateBlankClick ? `${hour}:00 添加任务` : undefined}
            aria-label={isGridSlot && onDateBlankClick ? `在 ${dayKey} ${hour}:00 添加任务` : undefined}
            tabIndex={isGridSlot && onDateBlankClick ? 0 : -1}
          />
        );
      })}
      {isGridSlot ? (
        <div className="pointer-events-none absolute inset-0 grid grid-cols-7" aria-hidden>
          {Array.from({ length: 7 }, (_, col) => (
            <div
              key={col}
              className={[
                "border-r border-border-subtle/50",
                col === 0 ? "border-l border-border-subtle/50" : "",
                col === 6 ? "border-r-0" : "",
              ].join(" ")}
            />
          ))}
        </div>
      ) : null}
      {blocks.length === 0 && emptyLabel ? (
        <div
          className={[
            "absolute inset-y-0 flex items-center justify-center p-1 text-center text-[10px] text-neutral-muted pointer-events-none",
            isGridSlot ? "left-0" : "inset-x-0",
          ].join(" ")}
          style={isGridSlot ? { width: `${gridColWidthPct}%` } : undefined}
        >
          {emptyLabel}
        </div>
      ) : null}

      {blocks.map((block) => {
        if (block.segments.length === 0) return null;
        const c = taskCalendarColors(block.item.priority);
        const isDragging = dragItemId === block.item.id;

        const previewRange =
          isDragging && dragOverDateKey && dragOverHour != null
            ? computeRescheduledRange(
                block.item,
                { dateKey: dragOverDateKey, hour: dragOverHour },
                dayKey,
              )
            : null;

        const boxTop = Math.min(...block.segments.map((s) => s.topPx));
        const boxLeft = Math.min(...block.segments.map((s) => s.leftPct));
        const boxRight = Math.max(...block.segments.map((s) => s.leftPct + s.widthPct));
        const boxBottom = Math.max(...block.segments.map((s) => s.topPx + s.heightPx));
        const boxWidthPct = boxRight - boxLeft;
        const boxHeightPx = Math.max(boxBottom - boxTop, CALENDAR_TASK_CARD_HEIGHT_PX);

        return (
          <div
            key={`${dayKey}-${block.item.id}-wrap`}
            className={[
              "absolute z-[1] overflow-hidden rounded-lg border p-0 text-left shadow-sm hover:brightness-[0.97] transition-[filter]",
              droppable ? "cursor-grab active:cursor-grabbing" : "",
              isDragging ? "opacity-40" : "",
            ].join(" ")}
            style={{
              top: boxTop,
              height: boxHeightPx,
              left: `calc(${boxLeft}% + 2px)`,
              width: `calc(${boxWidthPct}% - 4px)`,
              backgroundColor: c.bg,
              color: c.fg,
              borderColor: c.border,
              borderLeftColor: taskLabelStripeColor(block.item.color, c.border),
              borderLeftWidth: compact ? 3 : 4,
            }}
            title={calendarTaskTooltip(block.item, showProjectContext)}
            draggable={droppable && !!onDragItemIdChange}
            onDragStart={
              droppable && onDragItemIdChange
                ? (e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/task-id", block.item.id);
                    try {
                      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
                    } catch {
                      // ignore setDragImage failures
                    }
                    onDragItemIdChange(block.item.id);
                  }
                : undefined
            }
            onDragEnd={onDragItemIdChange ? () => onDragItemIdChange(null) : undefined}
            onClick={() => onTaskClick(block.item)}
            role="button"
            tabIndex={0}
          >
            <CalendarTaskCard
              item={block.item}
              showProjectContext={showProjectContext}
              completingItemId={completingItemId}
              onCompleteTask={onCompleteTask}
              compact={compact}
              previewStartAtIso={previewRange ? previewRange.startAt : undefined}
              previewEndAtIso={previewRange ? previewRange.endAt : undefined}
            />
          </div>
        );
      })}

      {droppable && dragOverDateKey === dayKey && dragOverHour != null ? (
        <>
          <div
            className="pointer-events-none absolute z-[3] flex items-center"
            style={{
              top: dragOverHour * DAY_TIMELINE_HOUR_HEIGHT_PX,
              left: 0,
              right: 0,
              height: 0,
            }}
          >
            <div className="-translate-y-1/2 rounded-r-md bg-primary px-1.5 py-px text-[10px] font-semibold tabular-nums text-on-primary shadow">
              {formatFloatHour(dragOverHour)}
            </div>
            <div className="-translate-y-1/2 ml-0 h-0.5 flex-1 bg-primary/50" />
          </div>
          {!isGridSlot ? (
            <div
              className="pointer-events-none absolute left-0 right-0 z-[2] bg-primary/10"
              style={{
                top: dragOverHour * DAY_TIMELINE_HOUR_HEIGHT_PX,
                height: DAY_TIMELINE_HOUR_HEIGHT_PX / 4,
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
