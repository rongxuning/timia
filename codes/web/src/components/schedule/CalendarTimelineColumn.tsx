"use client";

import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { calendarTaskTooltip } from "./CalendarTaskBar";
import { CalendarTaskCardLines } from "./CalendarTaskCardLines";
import type { DayTimelineBlock } from "./calendarDayLayout";
import { DAY_TIMELINE_HEIGHT_PX, DAY_TIMELINE_HOUR_HEIGHT_PX } from "./calendarDayLayout";
import { TaskStatusIcon } from "./TaskStatusIcon";
import { taskCalendarColors } from "./taskUtils";

type Props = {
  dayKey: string;
  blocks: DayTimelineBlock[];
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
  onDateBlankClick?: (dateKey: string, hour?: number) => void;
  compact?: boolean;
  bordered?: boolean;
  emptyLabel?: string;
  /** 日视图：同时间段任务各占一列网格宽度并横向排列；默认在列内按 lane 分割宽度 */
  laneLayout?: "column-split" | "grid-slot";
};

export function CalendarTimelineColumn({
  dayKey,
  blocks,
  onTaskClick,
  onCompleteTask,
  completingItemId = null,
  showProjectContext = true,
  onDateBlankClick,
  compact = false,
  bordered = false,
  emptyLabel,
  laneLayout = "column-split",
}: Props) {
  const isGridSlot = laneLayout === "grid-slot";
  const gridColWidthPct = 100 / 7;

  function handleTimelineBlankClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onDateBlankClick) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (isGridSlot) {
      const x = e.clientX - rect.left;
      if (x > (rect.width * gridColWidthPct) / 100) return;
    }
    const y = e.clientY - rect.top;
    const hour = Math.min(23, Math.max(0, Math.floor(y / DAY_TIMELINE_HOUR_HEIGHT_PX)));
    onDateBlankClick(dayKey, hour);
  }

  const titleClassName = compact ? "text-[10px]" : "text-[11px]";
  const metaClassName = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div
      className={[
        "relative min-w-0",
        bordered && !isGridSlot ? "border-r border-border-subtle last:border-r-0" : "",
        onDateBlankClick && !isGridSlot ? "cursor-pointer" : "",
        isGridSlot ? "flex-1" : "",
      ].join(" ")}
      style={{ height: DAY_TIMELINE_HEIGHT_PX }}
      onClick={onDateBlankClick && !isGridSlot ? handleTimelineBlankClick : undefined}
      title={onDateBlankClick && !isGridSlot ? "点击空白处添加任务" : undefined}
    >
      {isGridSlot && onDateBlankClick ? (
        <button
          type="button"
          className="absolute top-0 bottom-0 left-0 z-0 cursor-pointer bg-transparent"
          style={{ width: `${gridColWidthPct}%` }}
          onClick={handleTimelineBlankClick}
          title="点击空白处添加任务"
          aria-label={`在 ${dayKey} 添加任务`}
        />
      ) : null}
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className="absolute left-0 right-0 border-b border-border-subtle/50"
          style={{ top: hour * DAY_TIMELINE_HOUR_HEIGHT_PX, height: DAY_TIMELINE_HOUR_HEIGHT_PX }}
        />
      ))}
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
        return (
          <button
            key={`${dayKey}-${block.item.id}-${block.lane}`}
            type="button"
            className="absolute z-[1] flex items-center overflow-hidden rounded-lg border px-1 py-0.5 text-left shadow-sm hover:brightness-[0.97] transition-[filter]"
            style={{
              top: block.topPx,
              height: block.heightPx,
              left: `calc(${leftPct}% + 2px)`,
              width: `calc(${widthPct}% - 4px)`,
              backgroundColor: c.bg,
              color: c.fg,
              borderColor: c.border,
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
            </div>
          </button>
        );
      })}
    </div>
  );
}
