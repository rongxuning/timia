"use client";

import type { CalendarWeekView, ScheduleTaskItem } from "@/types/api/views/schedule";
import { TaskStatusIcon } from "./TaskStatusIcon";
import {
  CALENDAR_LANE_GAP_PX,
  CALENDAR_LANE_HEIGHT_PX,
  dayKeyLocal,
  formatScheduleDateTime,
  MONTHS,
  taskCalendarColors,
} from "./taskUtils";

export type ScheduleCalendarProps = {
  calendarMonth: Date;
  onCalendarMonthChange: (d: Date) => void;
  weeks: CalendarWeekView[];
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
};

function calendarTaskTooltip(it: ScheduleTaskItem, showProjectContext: boolean) {
  const parts = [it.title];
  if (showProjectContext) parts.push(`${it.workspace_name} / ${it.project_name}`);
  const body = it.body?.trim();
  if (body) parts.push(body);
  const start = formatScheduleDateTime(it.start_at);
  const end = formatScheduleDateTime(it.end_at);
  if (start) parts.push(`开始 ${start}`);
  if (end) parts.push(`结束 ${end}`);
  return parts.join(" · ");
}

export function ScheduleCalendar({
  calendarMonth,
  onCalendarMonthChange,
  weeks,
  onTaskClick,
  onCompleteTask,
  completingItemId = null,
  showProjectContext = true,
}: ScheduleCalendarProps) {
  const todayKey = dayKeyLocal(new Date());

  return (
    <section className="bg-white rounded-xl border border-border-subtle overflow-hidden mb-lg">
      <div className="p-lg flex items-center justify-between gap-lg">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-primary">日历</div>
          <div className="font-subhead text-lg text-text-primary">
            {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors"
            onClick={() => onCalendarMonthChange(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
            title="上个月"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors"
            onClick={() => {
              const d = new Date();
              onCalendarMonthChange(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            title="本月"
          >
            <span className="material-symbols-outlined text-[18px]">today</span>
          </button>
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors"
            onClick={() => onCalendarMonthChange(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
            title="下个月"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="bg-surface">
        <div className="grid grid-cols-7 border-t border-border-subtle bg-surface-container-lowest">
          {["日", "一", "二", "三", "四", "五", "六"].map((d, di) => (
            <div
              key={d}
              className={[
                "p-lg text-center font-overline text-neutral-muted border-r border-b border-border-subtle",
                di === 0 ? "border-l border-border-subtle" : "",
                "last:border-r-0",
              ].join(" ")}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="flex flex-col">
          {weeks.map((week, wi) => {
            const maxLane = week.segments.reduce((m, s) => Math.max(m, s.lane), -1);
            const rowCount = maxLane < 0 ? 0 : maxLane + 1;
            const minTaskLanes = 3;
            const lanes = Math.max(rowCount, minTaskLanes);
            const taskAreaMinHeightPx =
              4 +
              8 +
              lanes * CALENDAR_LANE_HEIGHT_PX +
              Math.max(0, lanes - 1) * CALENDAR_LANE_GAP_PX;
            return (
              <div key={wi} className="border-b border-border-subtle last:border-b-0 flex flex-col min-h-0">
                <div className="grid grid-cols-7 shrink-0">
                  {week.days.map(({ key, day, in_month }, di) => {
                    const isToday = key === todayKey;
                    return (
                      <div
                        key={key}
                        className={[
                          "border-r border-b border-border-subtle p-2 min-h-[44px]",
                          di === 0 ? "border-l border-border-subtle" : "",
                          in_month ? "bg-surface" : "bg-surface-container-low/60 text-neutral-muted opacity-60",
                          isToday ? "bg-violet-200 ring-1 ring-violet-400 ring-inset z-[1]" : "",
                          "last:border-r-0",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between">
                          <span className={in_month ? "font-small font-medium text-text-primary" : "font-small"}>
                            {day}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="relative border-t border-border-subtle/70 bg-surface">
                  <div
                    className="relative z-[1] grid grid-cols-7 gap-x-0 gap-y-1 px-0 pb-2 pt-1"
                    style={{
                      gridAutoRows: CALENDAR_LANE_HEIGHT_PX,
                      minHeight: taskAreaMinHeightPx,
                    }}
                  >
                    {week.segments.map((seg) => {
                      const c = taskCalendarColors(seg.item.priority);
                      const radius =
                        seg.round_left && seg.round_right
                          ? 8
                          : seg.round_left
                            ? "8px 0 0 8px"
                            : seg.round_right
                              ? "0 8px 8px 0"
                              : 0;
                      const showLabel = seg.round_left || seg.col_start === 1;
                      const bodyText = seg.item.body?.trim() ?? "";
                      const startLabel = formatScheduleDateTime(seg.item.start_at);
                      const endLabel = formatScheduleDateTime(seg.item.end_at);
                      return (
                        <button
                          key={`cal-${seg.item.id}-${wi}-${seg.col_start}-${seg.lane}`}
                          type="button"
                          onClick={() => onTaskClick(seg.item)}
                          title={calendarTaskTooltip(seg.item, showProjectContext)}
                          className="flex h-full min-h-0 items-start py-1 text-left text-[10px] leading-snug px-1 min-w-0 border-solid hover:brightness-[0.97] transition-[filter] z-[2] shadow-sm overflow-hidden"
                          style={{
                            gridColumn: `${seg.col_start} / span ${seg.col_span}`,
                            gridRow: seg.lane + 1,
                            backgroundColor: c.bg,
                            color: c.fg,
                            borderColor: c.border,
                            borderWidth: 1,
                            borderLeftWidth: seg.round_left ? 4 : 1,
                            borderRadius: radius,
                          }}
                        >
                          {showLabel ? (
                            <div className="flex min-w-0 flex-1 items-start gap-1">
                              <TaskStatusIcon
                                size="compact"
                                status={seg.item.status}
                                loading={completingItemId === seg.item.id}
                                onComplete={
                                  onCompleteTask ? () => onCompleteTask(seg.item.id) : undefined
                                }
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[11px] font-medium leading-tight">
                                  {seg.item.title}
                                </div>
                                {showProjectContext ? (
                                  <div className="mt-0.5 truncate text-neutral-muted/90">
                                    {seg.item.workspace_name} / {seg.item.project_name}
                                  </div>
                                ) : null}
                                {bodyText ? (
                                  <div className="mt-0.5 truncate text-neutral-muted/90">{bodyText}</div>
                                ) : null}
                                <div className="mt-0.5 truncate tabular-nums text-neutral-muted/90">
                                  {startLabel ? `开始 ${startLabel}` : "开始 —"}
                                </div>
                                <div className="mt-0.5 truncate tabular-nums text-neutral-muted/90">
                                  {endLabel ? `结束 ${endLabel}` : "结束 —"}
                                </div>
                              </div>
                            </div>
                          ) : (
                            "\u00a0"
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7" aria-hidden>
                    {[0, 1, 2, 3, 4, 5, 6].map((col) => (
                      <div
                        key={col}
                        className={[
                          "border-r border-border-subtle",
                          col === 0 ? "border-l border-border-subtle" : "",
                          col === 6 ? "border-r-0" : "",
                        ].join(" ")}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
