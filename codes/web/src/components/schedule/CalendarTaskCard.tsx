"use client";

import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { CalendarTaskCardLines } from "./CalendarTaskCardLines";
import { TaskStatusIcon } from "./TaskStatusIcon";
import { priorityLabel } from "./taskUtils";

export type CalendarTaskCardProps = {
  item: ScheduleTaskItem;
  showProjectContext: boolean;
  completingItemId?: string | null;
  onCompleteTask?: (itemId: string) => void;
  compact?: boolean;
  previewStartAtIso?: string | null;
  previewEndAtIso?: string | null;
};

export function CalendarTaskCard({
  item,
  showProjectContext,
  completingItemId = null,
  onCompleteTask,
  compact = false,
  previewStartAtIso,
  previewEndAtIso,
}: CalendarTaskCardProps) {
  const titleClassName = compact ? "text-[10px]" : "text-[11px]";
  const metaClassName = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 items-start gap-1.5 p-1">
      <TaskStatusIcon
        size="compact"
        status={item.status}
        loading={completingItemId === item.id}
        onComplete={onCompleteTask ? () => onCompleteTask(item.id) : undefined}
      />
      <div className="min-w-0 flex-1 pr-8">
        <CalendarTaskCardLines
          item={item}
          showProjectContext={showProjectContext}
          titleClassName={titleClassName}
          metaClassName={metaClassName}
          previewStartAtIso={previewStartAtIso}
          previewEndAtIso={previewEndAtIso}
        />
      </div>
      <div className="pointer-events-none absolute right-1 top-1">
        <AssigneeAvatar displayName={item.assignee?.display_name} size="compact" />
      </div>
      <div
        className="pointer-events-none absolute bottom-1 right-1 text-[9px] font-medium tabular-nums opacity-80"
        title={priorityLabel(item.priority)}
        aria-label={priorityLabel(item.priority)}
      >
        {priorityLabel(item.priority)}
      </div>
    </div>
  );
}
