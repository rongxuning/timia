"use client";

import type { DragEvent } from "react";
import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { CalendarTaskCard } from "./CalendarTaskCard";
import {
  formatScheduleTimeRange,
  taskCalendarColors,
  taskLabelStripeColor,
} from "./taskUtils";

export function calendarTaskTooltip(it: ScheduleTaskItem, showProjectContext: boolean) {
  const parts = [it.title];
  if (showProjectContext) parts.push(`${it.workspace_name} / ${it.project_name}`);
  const body = it.body?.trim();
  if (body) parts.push(body);
  const range = formatScheduleTimeRange(it.start_at, it.end_at);
  if (range) parts.push(range);
  return parts.join(" · ");
}

type CalendarTaskBarProps = {
  item: ScheduleTaskItem;
  showLabel: boolean;
  roundLeft: boolean;
  roundRight: boolean;
  showProjectContext: boolean;
  /** Kept for API stability; CalendarTaskCard always shows avatar/? */
  showAssigneeAvatar?: boolean;
  completingItemId?: string | null;
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  compact?: boolean;
  /** 是否允许拖拽（默认 false，不影响其它用法） */
  draggable?: boolean;
  /** 拖起时通知上层（用于写 dataTransfer / 更新 dragItemId） */
  onDragStart?: (item: ScheduleTaskItem, e: DragEvent<HTMLButtonElement>) => void;
  /** 拖拽结束（drop / cancel）时通知上层 */
  onDragEnd?: (item: ScheduleTaskItem) => void;
  /** 当前是否处于被拖起状态（视觉上 dim） */
  isDragging?: boolean;
};

export function CalendarTaskBar({
  item,
  showLabel,
  roundLeft,
  roundRight,
  showProjectContext,
  showAssigneeAvatar: _showAssigneeAvatar = false,
  completingItemId = null,
  onTaskClick,
  onCompleteTask,
  compact = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
}: CalendarTaskBarProps) {
  const c = taskCalendarColors(item.priority);
  const radius =
    roundLeft && roundRight ? 8 : roundLeft ? "8px 0 0 8px" : roundRight ? "0 8px 8px 0" : 0;

  return (
    <button
      type="button"
      onClick={() => onTaskClick(item)}
      title={calendarTaskTooltip(item, showProjectContext)}
      draggable={draggable}
      onDragStart={
        draggable && onDragStart
          ? (e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/task-id", item.id);
              onDragStart(item, e);
            }
          : undefined
      }
      onDragEnd={draggable && onDragEnd ? () => onDragEnd(item) : undefined}
      className={[
        "relative flex h-full min-h-0 w-full items-center text-left text-[10px] min-w-0 border-solid hover:brightness-[0.97] transition-[filter] z-[2] shadow-sm overflow-hidden",
        showLabel ? "p-0" : "px-1 py-0.5",
        draggable ? "cursor-grab active:cursor-grabbing" : "",
        isDragging ? "opacity-40" : "",
      ].join(" ")}
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        borderColor: c.border,
        borderLeftColor: taskLabelStripeColor(item.color, c.border),
        borderWidth: 1,
        borderLeftWidth: roundLeft ? 4 : 1,
        borderRadius: radius,
      }}
    >
      {showLabel ? (
        <CalendarTaskCard
          item={item}
          showProjectContext={showProjectContext}
          completingItemId={completingItemId}
          onCompleteTask={onCompleteTask}
          compact={compact}
        />
      ) : (
        "\u00a0"
      )}
    </button>
  );
}
