"use client";

import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { formatScheduleTimeRange } from "./taskUtils";

type CalendarTaskCardLinesProps = {
  item: ScheduleTaskItem;
  showProjectContext: boolean;
  titleClassName?: string;
  metaClassName?: string;
  crossesDay?: boolean;
};

export function CalendarTaskCardLines({
  item,
  showProjectContext,
  titleClassName = "text-[11px]",
  metaClassName = "text-[10px]",
  crossesDay = false,
}: CalendarTaskCardLinesProps) {
  const bodyText = item.body?.trim() ?? "";
  const timeRangeLabel = formatScheduleTimeRange(item.start_at, item.end_at);

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-px leading-none">
      <div className={`truncate font-medium leading-tight ${titleClassName}`}>{item.title}</div>
      {showProjectContext ? (
        <div className={`truncate leading-tight text-neutral-muted/90 ${metaClassName}`}>
          {item.workspace_name} / {item.project_name}
        </div>
      ) : null}
      {bodyText ? (
        <div className={`truncate leading-tight text-neutral-muted/90 ${metaClassName}`}>{bodyText}</div>
      ) : null}
      {timeRangeLabel ? (
        <div className={`truncate leading-tight tabular-nums text-neutral-muted/90 ${metaClassName}`}>
          {timeRangeLabel}
          {crossesDay ? " · 跨天" : ""}
        </div>
      ) : null}
    </div>
  );
}
