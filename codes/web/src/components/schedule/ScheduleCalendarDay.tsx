"use client";

import type { CalendarDayDetailView } from "@/types/api/views/schedule";
import { calendarTaskTooltip } from "./CalendarTaskBar";
import { CalendarTaskCardLines } from "./CalendarTaskCardLines";
import { layoutDayTimeline, DAY_TIMELINE_HEIGHT_PX, DAY_TIMELINE_HOUR_HEIGHT_PX } from "./calendarDayLayout";
import { TaskStatusIcon } from "./TaskStatusIcon";
import type { ScheduleCalendarBodyProps } from "./ScheduleCalendar.types";
import { taskCalendarColors } from "./taskUtils";

type Props = ScheduleCalendarBodyProps & {
  day: CalendarDayDetailView;
};

export function ScheduleCalendarDay({
  day,
  onTaskClick,
  onCompleteTask,
  completingItemId,
  showProjectContext = true,
}: Props) {
  const blocks = layoutDayTimeline(day.items, day.key);

  return (
    <div className="border-t border-border-subtle bg-surface">
      <div className="flex">
        <div
          className="w-14 shrink-0 border-r border-border-subtle bg-surface-container-lowest/60"
          style={{ height: DAY_TIMELINE_HEIGHT_PX }}
        >
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="relative border-b border-border-subtle/60 pr-1 text-right text-[10px] text-neutral-muted tabular-nums"
              style={{ height: DAY_TIMELINE_HOUR_HEIGHT_PX }}
            >
              <span className="absolute -top-2 right-1">{String(hour).padStart(2, "0")}:00</span>
            </div>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: DAY_TIMELINE_HEIGHT_PX }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-b border-border-subtle/50"
              style={{ top: hour * DAY_TIMELINE_HOUR_HEIGHT_PX, height: DAY_TIMELINE_HOUR_HEIGHT_PX }}
            />
          ))}
          {day.items.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center p-lg text-caption text-neutral-muted pointer-events-none">
              当天暂无任务
            </div>
          ) : null}
          {blocks.map((block) => {
              const c = taskCalendarColors(block.item.priority);
              const widthPct = 100 / block.laneCount;
              const leftPct = block.lane * widthPct;
              return (
                <button
                  key={`day-${block.item.id}-${block.lane}`}
                  type="button"
                  className="absolute flex items-center overflow-hidden rounded-lg border px-1.5 py-0.5 text-left shadow-sm hover:brightness-[0.97] transition-[filter]"
                  style={{
                    top: block.topPx,
                    height: block.heightPx,
                    left: `calc(${leftPct}% + 4px)`,
                    width: `calc(${widthPct}% - 8px)`,
                    backgroundColor: c.bg,
                    color: c.fg,
                    borderColor: c.border,
                    borderLeftWidth: 4,
                  }}
                  title={calendarTaskTooltip(block.item, showProjectContext)}
                  onClick={() => onTaskClick(block.item)}
                >
                  <div className="flex min-h-0 min-w-0 flex-1 items-center gap-1">
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
                    />
                  </div>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
