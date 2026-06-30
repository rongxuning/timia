"use client";

import type { ScheduleCalendarView, ScheduleTaskItem } from "@/types/api/views/schedule";
import {
  CALENDAR_VIEW_MODES,
  calendarNavStepLabel,
  calendarTitle,
  calendarTodayLabel,
  shiftCalendarAnchor,
  startOfDay,
  parseDateAnchor,
  type CalendarViewMode,
} from "./calendarNav";
import { ScheduleCalendarDay } from "./ScheduleCalendarDay";
import { ScheduleCalendarMonth } from "./ScheduleCalendarMonth";
import { ScheduleCalendarWeek } from "./ScheduleCalendarWeek";

export type ScheduleCalendarProps = {
  calendarMode: CalendarViewMode;
  onCalendarModeChange: (mode: CalendarViewMode) => void;
  calendarAnchor: Date;
  onCalendarAnchorChange: (d: Date) => void;
  calendar: ScheduleCalendarView | null;
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
  onDateBlankClick?: (dateKey: string, hour?: number) => void;
};

export function ScheduleCalendar({
  calendarMode,
  onCalendarModeChange,
  calendarAnchor,
  onCalendarAnchorChange,
  calendar,
  onTaskClick,
  onCompleteTask,
  completingItemId = null,
  showProjectContext = true,
  onDateBlankClick,
}: ScheduleCalendarProps) {
  function openDayView(dateKey: string) {
    onCalendarAnchorChange(parseDateAnchor(dateKey));
    onCalendarModeChange("day");
  }

  const bodyProps = {
    onTaskClick,
    onCompleteTask,
    completingItemId,
    showProjectContext,
    onDateBlankClick,
    onDateHeaderClick: openDayView,
  };

  return (
    <section className="bg-white rounded-xl border border-border-subtle overflow-hidden mb-lg">
      <div className="p-lg flex flex-col gap-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-primary">日历</div>
          <div className="font-subhead text-lg text-text-primary">
            {calendarTitle(calendarAnchor, calendarMode)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-border-subtle p-0.5 bg-surface-container-lowest/50">
            {CALENDAR_VIEW_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={[
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  calendarMode === m.key
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-text-secondary hover:bg-surface-container-lowest",
                ].join(" ")}
                onClick={() => onCalendarModeChange(m.key)}
                aria-pressed={calendarMode === m.key}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors"
            onClick={() => onCalendarAnchorChange(shiftCalendarAnchor(calendarAnchor, calendarMode, -1))}
            title={calendarNavStepLabel(calendarMode).split(" / ")[0]}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button
            type="button"
            className="h-10 px-3 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors text-sm"
            onClick={() => onCalendarAnchorChange(startOfDay(new Date()))}
            title={calendarTodayLabel(calendarMode)}
          >
            {calendarTodayLabel(calendarMode)}
          </button>
          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors"
            onClick={() => onCalendarAnchorChange(shiftCalendarAnchor(calendarAnchor, calendarMode, 1))}
            title={calendarNavStepLabel(calendarMode).split(" / ")[1]}
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="bg-surface">
        {calendarMode === "month" ? (
          <>
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
            <ScheduleCalendarMonth weeks={calendar?.weeks ?? []} {...bodyProps} />
          </>
        ) : null}
        {calendarMode === "week" && calendar?.weeks[0] ? (
          <ScheduleCalendarWeek week={calendar.weeks[0]} {...bodyProps} />
        ) : null}
        {calendarMode === "week" && !calendar?.weeks[0] ? (
          <div className="p-lg text-caption text-neutral-muted border-t border-border-subtle">加载中…</div>
        ) : null}
        {calendarMode === "day" && calendar?.day ? (
          <ScheduleCalendarDay day={calendar.day} {...bodyProps} />
        ) : null}
        {calendarMode === "day" && !calendar?.day ? (
          <div className="p-lg text-caption text-neutral-muted border-t border-border-subtle">加载中…</div>
        ) : null}
      </div>
    </section>
  );
}
