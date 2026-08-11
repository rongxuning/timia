"use client";

import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { formatScheduleTimeRange } from "./taskUtils";

type CalendarTaskCardLinesProps = {
  item: ScheduleTaskItem;
  showProjectContext: boolean;
  titleClassName?: string;
  metaClassName?: string;
  /** 拖拽预览时覆盖显示的时间（不修改 item 本身） */
  previewStartAtIso?: string | null;
  previewEndAtIso?: string | null;
};

/**
 * 日历任务卡中间文案（三模式统一）：
 * 1. 标题（加粗）
 * 2. 空间 / 项目（浅灰）
 * 3. 起始终止时间（浅色）
 * 4. 任务描述（浅色）
 *
 * 四行固定槽位；缺省项用等高占位。月/日/周卡面高度统一为 CALENDAR_TASK_CARD_HEIGHT_PX(72)。
 */
export function CalendarTaskCardLines({
  item,
  showProjectContext,
  titleClassName = "text-[11px]",
  metaClassName = "text-[9px]",
  previewStartAtIso,
  previewEndAtIso,
}: CalendarTaskCardLinesProps) {
  const bodyText = item.body?.trim() ?? "";
  const startIso = previewStartAtIso !== undefined ? previewStartAtIso : item.start_at;
  const endIso = previewEndAtIso !== undefined ? previewEndAtIso : item.end_at;
  const timeRangeLabel = formatScheduleTimeRange(startIso, endIso);
  const isPreviewing = previewStartAtIso !== undefined || previewEndAtIso !== undefined;

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-start gap-px leading-none">
      <div className={`truncate font-bold leading-tight ${titleClassName}`}>{item.title}</div>
      {showProjectContext ? (
        <div className={`truncate leading-tight text-neutral-muted/90 ${metaClassName}`}>
          {item.workspace_name} / {item.project_name}
        </div>
      ) : (
        <div className={`h-[10px] ${metaClassName}`} aria-hidden />
      )}
      {timeRangeLabel ? (
        <div
          className={[
            `truncate leading-tight tabular-nums ${metaClassName}`,
            isPreviewing ? "text-primary font-semibold" : "text-neutral-muted/80",
          ].join(" ")}
        >
          {timeRangeLabel}
        </div>
      ) : (
        <div className={`h-[10px] ${metaClassName}`} aria-hidden />
      )}
      {bodyText ? (
        <div className={`truncate leading-tight text-neutral-muted/80 ${metaClassName}`}>{bodyText}</div>
      ) : (
        <div className={`h-[10px] ${metaClassName}`} aria-hidden />
      )}
    </div>
  );
}
