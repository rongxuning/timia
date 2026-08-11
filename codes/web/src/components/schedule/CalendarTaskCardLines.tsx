"use client";

import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { formatScheduleTimeRange } from "./taskUtils";

type CalendarTaskCardLinesProps = {
  item: ScheduleTaskItem;
  showProjectContext: boolean;
  titleClassName?: string;
  metaClassName?: string;
  crossesDay?: boolean;
  /** 拖拽预览时覆盖显示的时间（不修改 item 本身） */
  previewStartAtIso?: string | null;
  previewEndAtIso?: string | null;
};

export function CalendarTaskCardLines({
  item,
  showProjectContext,
  titleClassName = "text-[11px]",
  metaClassName = "text-[10px]",
  crossesDay = false,
  previewStartAtIso,
  previewEndAtIso,
}: CalendarTaskCardLinesProps) {
  const bodyText = item.body?.trim() ?? "";
  const startIso = previewStartAtIso !== undefined ? previewStartAtIso : item.start_at;
  const endIso = previewEndAtIso !== undefined ? previewEndAtIso : item.end_at;
  const timeRangeLabel = formatScheduleTimeRange(startIso, endIso);
  const isPreviewing = previewStartAtIso !== undefined || previewEndAtIso !== undefined;

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
        <div
          className={[
            `truncate leading-tight tabular-nums ${metaClassName}`,
            isPreviewing ? "text-primary font-semibold" : "text-neutral-muted/90",
          ].join(" ")}
        >
          {timeRangeLabel}
          {crossesDay ? " · 跨天" : ""}
        </div>
      ) : null}
    </div>
  );
}
