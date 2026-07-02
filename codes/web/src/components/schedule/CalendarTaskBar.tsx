"use client";

import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { CalendarTaskCardLines } from "./CalendarTaskCardLines";
import { TaskStatusIcon } from "./TaskStatusIcon";
import { formatScheduleTimeRange, taskCalendarColors } from "./taskUtils";

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
  showAssigneeAvatar?: boolean;
  completingItemId?: string | null;
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  compact?: boolean;
};

export function CalendarTaskBar({
  item,
  showLabel,
  roundLeft,
  roundRight,
  showProjectContext,
  showAssigneeAvatar = false,
  completingItemId = null,
  onTaskClick,
  onCompleteTask,
  compact = false,
}: CalendarTaskBarProps) {
  const c = taskCalendarColors(item.priority);
  const radius =
    roundLeft && roundRight ? 8 : roundLeft ? "8px 0 0 8px" : roundRight ? "0 8px 8px 0" : 0;

  return (
    <button
      type="button"
      onClick={() => onTaskClick(item)}
      title={calendarTaskTooltip(item, showProjectContext)}
      className="flex h-full min-h-0 w-full items-center py-0.5 text-left text-[10px] px-1 min-w-0 border-solid hover:brightness-[0.97] transition-[filter] z-[2] shadow-sm overflow-hidden"
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        borderColor: c.border,
        borderWidth: 1,
        borderLeftWidth: roundLeft ? 4 : 1,
        borderRadius: radius,
      }}
    >
      {showLabel ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <TaskStatusIcon
            size="compact"
            status={item.status}
            loading={completingItemId === item.id}
            onComplete={onCompleteTask ? () => onCompleteTask(item.id) : undefined}
          />
          <CalendarTaskCardLines
            item={item}
            showProjectContext={showProjectContext}
            titleClassName={compact ? "text-[10px]" : "text-[11px]"}
            metaClassName="text-[10px]"
          />
          {showAssigneeAvatar && item.assignee ? (
            <AssigneeAvatar displayName={item.assignee.display_name} size="compact" />
          ) : null}
        </div>
      ) : (
        "\u00a0"
      )}
    </button>
  );
}
