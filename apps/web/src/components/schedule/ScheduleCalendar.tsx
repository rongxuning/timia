"use client";

import type { CalendarWeek, ScheduleTaskItem } from "./types";
import { dayKeyLocal, MONTHS, taskCalendarColors } from "./taskUtils";

export type ScheduleCalendarProps = {
  calendarMonth: Date;
  onCalendarMonthChange: (d: Date) => void;
  weeks: CalendarWeek[];
  onTaskClick: (it: ScheduleTaskItem) => void;
};

export function ScheduleCalendar({ calendarMonth, onCalendarMonthChange, weeks, onTaskClick }: ScheduleCalendarProps) {
  const today = new Date();
  const todayKey = dayKeyLocal(today);

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
            const taskAreaMinHeightPx = 4 + 8 + lanes * 22 + Math.max(0, lanes - 1) * 4;
            return (
              <div key={wi} className="border-b border-border-subtle last:border-b-0 flex flex-col min-h-0">
                <div className="grid grid-cols-7 shrink-0">
                  {week.days.map(({ date, key, inMonth }, di) => {
                    const isToday = key === todayKey;
                    return (
                      <div
                        key={key}
                        className={[
                          "border-r border-b border-border-subtle p-2 min-h-[44px]",
                          di === 0 ? "border-l border-border-subtle" : "",
                          inMonth ? "bg-surface" : "bg-surface-container-low/60 text-neutral-muted opacity-60",
                          isToday ? "bg-violet-200 ring-1 ring-violet-400 ring-inset z-[1]" : "",
                          "last:border-r-0",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between">
                          <span className={inMonth ? "font-small font-medium text-text-primary" : "font-small"}>
                            {date.getDate()}
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
                      gridAutoRows: 22,
                      minHeight: taskAreaMinHeightPx,
                    }}
                  >
                    {week.segments.map((seg) => {
                      const c = taskCalendarColors(seg.item.id);
                      const radius =
                        seg.roundLeft && seg.roundRight
                          ? 8
                          : seg.roundLeft
                            ? "8px 0 0 8px"
                            : seg.roundRight
                              ? "0 8px 8px 0"
                              : 0;
                      const showLabel = seg.roundLeft || seg.colStart === 1;
                      return (
                        <button
                          key={`cal-${seg.item.id}-${wi}-${seg.colStart}-${seg.lane}`}
                          type="button"
                          onClick={() => onTaskClick(seg.item)}
                          title={`${seg.item.title} · ${seg.item.workspace_name} / ${seg.item.project_name}`}
                          className="h-[22px] flex items-center text-left text-[11px] px-1.5 font-medium truncate border-solid hover:brightness-[0.97] transition-[filter] z-[2] shadow-sm"
                          style={{
                            gridColumn: `${seg.colStart} / span ${seg.colSpan}`,
                            gridRow: seg.lane + 1,
                            backgroundColor: c.bg,
                            color: c.fg,
                            borderColor: c.border,
                            borderWidth: 1,
                            borderLeftWidth: seg.roundLeft ? 4 : 1,
                            borderRadius: radius,
                          }}
                        >
                          {showLabel ? seg.item.title : "\u00a0"}
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
