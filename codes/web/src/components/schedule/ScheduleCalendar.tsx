"use client";

import type { ScheduleCalendarView, ScheduleTaskItem } from "@/types/api/views/schedule";
import {
  CALENDAR_VIEW_MODES,
  calendarNavStepLabel,
  calendarTitle,
  calendarTodayLabel,
  formatDateAnchor,
  shiftCalendarAnchor,
  startOfDay,
  parseDateAnchor,
  type CalendarViewMode,
} from "./calendarNav";
import { ScheduleCalendarDay, ScheduleCalendarDayHeader } from "./ScheduleCalendarDay";
import { ScheduleCalendarMonth } from "./ScheduleCalendarMonth";
import { ScheduleCalendarWeek, ScheduleCalendarWeekHeader } from "./ScheduleCalendarWeek";
import { ScheduleCalendarYear } from "./ScheduleCalendarYear";
import type { CalendarDropTarget } from "./ScheduleCalendar.types";

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
  showAssigneeAvatar?: boolean;
  onDateBlankClick?: (dateKey: string, hour?: number) => void;
  /** 拖拽改期相关：与 PriorityQuadrants/SwimlaneKanban 共享 dragItemId 状态 */
  dragItemId?: string | null;
  dragOverDateKey?: string | null;
  dragOverHour?: number | null;
  reschedulingItemId?: string | null;
  onDragItemIdChange?: (id: string | null) => void;
  onDragOverDateKeyChange?: (key: string | null) => void;
  onDragOverHourChange?: (hour: number | null) => void;
  onDropDateTime?: (taskId: string, target: CalendarDropTarget) => void;
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
  showAssigneeAvatar = false,
  onDateBlankClick,
  dragItemId = null,
  dragOverDateKey = null,
  dragOverHour = null,
  reschedulingItemId = null,
  onDragItemIdChange,
  onDragOverDateKeyChange,
  onDragOverHourChange,
  onDropDateTime,
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
    showAssigneeAvatar,
    onDateBlankClick,
    onDateHeaderClick: openDayView,
    dragItemId,
    dragOverDateKey,
    dragOverHour,
    onDragItemIdChange,
    onDragOverDateKeyChange,
    onDragOverHourChange,
    onDropDateTime,
    reschedulingItemId,
  };
  const displayedMode = calendar?.view ?? calendarMode;
  const calendarPending =
    !calendar || calendar.view !== calendarMode || calendar.anchor !== formatDateAnchor(calendarAnchor);

  return (
    <section className="mb-lg rounded-xl border border-border-subtle bg-white">
      <div className="sticky top-0 z-30 shrink-0 bg-white shadow-sm">
        <div className="flex flex-col gap-3 p-lg sm:flex-row sm:items-center sm:justify-between">
          <div className="text-lg font-bold text-text-primary">
            {calendarTitle(calendarAnchor, calendarMode)}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <div className="inline-flex rounded-xl border border-border-subtle bg-surface-container-lowest/50 p-0.5">
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
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle transition-colors hover:bg-surface-container-lowest"
              onClick={() => onCalendarAnchorChange(shiftCalendarAnchor(calendarAnchor, calendarMode, -1))}
              title={calendarNavStepLabel(calendarMode).split(" / ")[0]}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              type="button"
              className="flex h-10 items-center justify-center rounded-xl border border-border-subtle px-3 text-sm transition-colors hover:bg-surface-container-lowest"
              onClick={() => onCalendarAnchorChange(startOfDay(new Date()))}
              title={calendarTodayLabel(calendarMode)}
            >
              {calendarTodayLabel(calendarMode)}
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle transition-colors hover:bg-surface-container-lowest"
              onClick={() => onCalendarAnchorChange(shiftCalendarAnchor(calendarAnchor, calendarMode, 1))}
              title={calendarNavStepLabel(calendarMode).split(" / ")[1]}
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>

        {displayedMode === "month" ? (
          <div className="grid grid-cols-7 border-t border-border-subtle bg-violet-50/80">
            {["日", "一", "二", "三", "四", "五", "六"].map((d, di) => (
              <div
                key={d}
                className={[
                  "border-r border-b border-border-subtle px-2 py-1 text-center text-[10px] font-medium leading-4 text-neutral-muted",
                  di === 0 ? "border-l border-border-subtle" : "",
                  "last:border-r-0",
                ].join(" ")}
              >
                {d}
              </div>
            ))}
          </div>
        ) : null}

        {displayedMode === "day" && calendar?.day ? (
          <div className="border-t border-border-subtle bg-surface">
            <ScheduleCalendarDayHeader
              day={calendar.day}
              onTaskClick={onTaskClick}
              onCompleteTask={onCompleteTask}
              completingItemId={completingItemId}
              showProjectContext={showProjectContext}
              showAssigneeAvatar={showAssigneeAvatar}
              dragItemId={dragItemId}
              onDragItemIdChange={onDragItemIdChange}
            />
          </div>
        ) : null}

        {displayedMode === "week" && calendar?.weeks[0] ? (
          <div className="bg-surface">
            <ScheduleCalendarWeekHeader week={calendar.weeks[0]} {...bodyProps} />
          </div>
        ) : null}
      </div>

      <div
        className={`relative bg-surface transition-opacity duration-150 ${calendarPending ? "opacity-70" : "opacity-100"}`}
        aria-busy={calendarPending}
      >
        {displayedMode === "month" ? (
          <ScheduleCalendarMonth weeks={calendar?.weeks ?? []} {...bodyProps} />
        ) : null}
        {displayedMode === "week" && calendar?.weeks[0] ? (
          <ScheduleCalendarWeek week={calendar.weeks[0]} showHeader={false} {...bodyProps} />
        ) : null}
        {displayedMode === "week" && !calendar?.weeks[0] ? (
          <div className="border-t border-border-subtle p-lg text-caption text-neutral-muted">加载中…</div>
        ) : null}
        {displayedMode === "day" && calendar?.day ? (
          <ScheduleCalendarDay day={calendar.day} showHeader={false} {...bodyProps} />
        ) : null}
        {displayedMode === "day" && !calendar?.day ? (
          <div className="border-t border-border-subtle p-lg text-caption text-neutral-muted">加载中…</div>
        ) : null}
        {displayedMode === "year" ? (
          <ScheduleCalendarYear
            year={calendar?.year ?? calendarAnchor.getFullYear()}
            months={calendar?.months ?? []}
            onDayClick={openDayView}
          />
        ) : null}
      </div>
    </section>
  );
}
