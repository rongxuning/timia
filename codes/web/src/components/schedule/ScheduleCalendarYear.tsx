"use client";

import type { CalendarMonthSummaryView } from "@/types/api/views/schedule";
import { DEFAULT_WEEK_START, leadingWeekdayBlanks, weekdayHeaderLabels } from "@/lib/weekStart";
import { dayKeyLocal, pad2 } from "./taskUtils";

type Props = {
  year: number;
  months: CalendarMonthSummaryView[];
  weekStartsOn?: number;
  onDayClick: (dateKey: string) => void;
};

function heatClass(taskCount: number): string {
  if (taskCount <= 0) return "bg-surface-container-low/40 text-neutral-muted";
  if (taskCount === 1) return "bg-primary/15 text-text-primary";
  if (taskCount <= 3) return "bg-primary/30 text-text-primary";
  if (taskCount <= 6) return "bg-primary/50 text-on-surface";
  return "bg-primary text-on-primary";
}

function monthGrid(
  year: number,
  month: number,
  days: CalendarMonthSummaryView["days"],
  weekStartsOn: number,
) {
  const countByKey = new Map(days.map((d) => [d.key, d.task_count]));
  const first = new Date(year, month - 1, 1);
  const startPad = leadingWeekdayBlanks(first, weekStartsOn);
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: Array<{ key: string; day: number; taskCount: number } | null> = [];

  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${pad2(month)}-${pad2(day)}`;
    cells.push({ key, day, taskCount: countByKey.get(key) ?? 0 });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function ScheduleCalendarYear({
  year,
  months,
  weekStartsOn = DEFAULT_WEEK_START,
  onDayClick,
}: Props) {
  const todayKey = dayKeyLocal(new Date());
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const weekdayHeaders = weekdayHeaderLabels(weekStartsOn);

  return (
    <div className="border-t border-border-subtle p-lg">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
          const summary = byMonth.get(month);
          const cells = monthGrid(year, month, summary?.days ?? [], weekStartsOn);
          return (
            <div key={month} className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-text-primary">{month}月</div>
                <div className="text-[11px] text-neutral-muted">{summary?.task_count ?? 0} 项</div>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {weekdayHeaders.map((d, index) => (
                  <div key={`${d}-${index}`} className="text-center text-[9px] leading-4 text-neutral-muted">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((cell, idx) => {
                  if (!cell) {
                    return <div key={`pad-${month}-${idx}`} className="aspect-square" />;
                  }
                  const isToday = cell.key === todayKey;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      title={`${cell.key} · ${cell.taskCount} 项`}
                      className={[
                        "aspect-square rounded-sm text-[10px] leading-none transition-colors",
                        heatClass(cell.taskCount),
                        isToday ? "ring-1 ring-primary ring-inset" : "hover:ring-1 hover:ring-primary/40",
                      ].join(" ")}
                      onClick={() => onDayClick(cell.key)}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
