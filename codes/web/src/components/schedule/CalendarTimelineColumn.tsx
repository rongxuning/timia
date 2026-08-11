"use client";

import { type DragEvent } from "react";
import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { calendarTaskTooltip } from "./CalendarTaskBar";
import { CalendarTaskCardLines } from "./CalendarTaskCardLines";
import type { DayTimelineBlock } from "./calendarDayLayout";
import { DAY_TIMELINE_HEIGHT_PX, DAY_TIMELINE_HOUR_HEIGHT_PX } from "./calendarDayLayout";
import { TaskStatusIcon } from "./TaskStatusIcon";
import { taskCalendarColors, taskLabelStripeColor } from "./taskUtils";

type Props = {
  dayKey: string;
  blocks: DayTimelineBlock[];
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
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
  showAssigneeAvatar = false,
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

  function handleTimelineBlankClick(e: React.MouseEvent<HTMLElement>) {
    if (!onDateBlankClick) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.min(23, Math.max(0, Math.floor(y / DAY_TIMELINE_HOUR_HEIGHT_PX)));
    onDateBlankClick(dayKey, hour);
  }

  function handleHourDragOver(e: DragEvent<HTMLButtonElement>, hour: number) {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDateKey !== dayKey) onDragOverDateKeyChange?.(dayKey);
    if (dragOverHour !== hour) onDragOverHourChange?.(hour);
  }

  /**
   * 列级 dragover：覆盖 column-split 模式（周视图）下小时槽是 pointer-events-none 的情况。
   * 此时整个列 div 才是真正的 drop target，hour 通过鼠标 Y 计算。
   * 不要 skip 落在 button 上的情况——任务卡自己没有 onDragOver，需要冒泡到列处理。
   * grid-slot 模式（日视图）下小时槽按钮有 stopPropagation 的 onDragOver，会优先于本 handler。
   */
  function handleColumnDragOver(e: DragEvent<HTMLDivElement>) {
    if (!droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.min(23, Math.max(0, Math.floor(y / DAY_TIMELINE_HOUR_HEIGHT_PX)));
    if (dragOverDateKey !== dayKey) onDragOverDateKeyChange?.(dayKey);
    if (dragOverHour !== hour) onDragOverHourChange?.(hour);
  }

  function handleColumnDrop(e: DragEvent<HTMLDivElement>) {
    if (!droppable || !onDropDateTime) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.min(23, Math.max(0, Math.floor(y / DAY_TIMELINE_HOUR_HEIGHT_PX)));
    const id = e.dataTransfer.getData("text/task-id") || dragItemId;
    onDragItemIdChange?.(null);
    onDragOverDateKeyChange?.(null);
    onDragOverHourChange?.(null);
    if (!id) return;
    onDropDateTime(id, { dateKey: dayKey, hour });
  }

  function handleHourDragLeave(e: DragEvent<HTMLButtonElement>) {
    if (!droppable) return;
    // 只在离开整个 hour 槽时清空（避免子元素冒泡触发）
    if (e.currentTarget !== e.target) return;
    if (dragOverDateKey === dayKey) onDragOverDateKeyChange?.(null);
    onDragOverHourChange?.(null);
  }

  function handleHourDrop(e: DragEvent<HTMLButtonElement>, hour: number) {
    if (!droppable || !onDropDateTime) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/task-id") || dragItemId;
    onDragItemIdChange?.(null);
    onDragOverDateKeyChange?.(null);
    onDragOverHourChange?.(null);
    if (!id) return;
    onDropDateTime(id, { dateKey: dayKey, hour });
  }

  const titleClassName = compact ? "text-[10px]" : "text-[11px]";
  const metaClassName = compact ? "text-[9px]" : "text-[10px]";

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
        const isHovered = droppable && dragOverDateKey === dayKey && dragOverHour === hour;
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
        const c = taskCalendarColors(block.item.priority);
        const widthPct = isGridSlot ? gridColWidthPct : 100 / block.laneCount;
        const leftPct = isGridSlot ? block.lane * gridColWidthPct : block.lane * widthPct;
        const isDragging = dragItemId === block.item.id;
        return (
          <button
            key={`${dayKey}-${block.item.id}-${block.lane}`}
            type="button"
            draggable={droppable && !!onDragItemIdChange}
            onDragStart={
              droppable && onDragItemIdChange
                ? (e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/task-id", block.item.id);
                    onDragItemIdChange(block.item.id);
                  }
                : undefined
            }
            onDragEnd={onDragItemIdChange ? () => onDragItemIdChange(null) : undefined}
            className={[
              "absolute z-[1] flex items-center overflow-hidden rounded-lg border px-1 py-0.5 text-left shadow-sm hover:brightness-[0.97] transition-[filter]",
              droppable ? "cursor-grab active:cursor-grabbing" : "",
              isDragging ? "opacity-40" : "",
            ].join(" ")}
            style={{
              top: block.topPx,
              height: block.heightPx,
              left: `calc(${leftPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
              backgroundColor: c.bg,
              color: c.fg,
              borderColor: c.border,
              borderLeftColor: taskLabelStripeColor(block.item.color, c.border),
              borderLeftWidth: compact ? 3 : 4,
            }}
            title={calendarTaskTooltip(block.item, showProjectContext)}
            onClick={() => onTaskClick(block.item)}
          >
            <div className="flex min-h-0 min-w-0 flex-1 items-center gap-0.5">
              <TaskStatusIcon
                size="compact"
                status={block.item.status}
                loading={completingItemId === block.item.id}
                onComplete={onCompleteTask ? () => onCompleteTask(block.item.id) : undefined}
              />
              <CalendarTaskCardLines
                item={block.item}
                showProjectContext={showProjectContext}
                crossesDay={block.crossesDay}
                titleClassName={titleClassName}
                metaClassName={metaClassName}
              />
              {showAssigneeAvatar && block.item.assignee ? (
                <AssigneeAvatar displayName={block.item.assignee.display_name} size="compact" />
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
