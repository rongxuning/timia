"use client";

import { useMemo, type ReactNode } from "react";
import type { HealthCalendarDay } from "@/types/api/views/health";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function parseMonth(month: string): { year: number; month: number } {
  const [year, monthNum] = month.split("-").map(Number);
  return { year: year || 1970, month: monthNum || 1 };
}

function shiftMonth(month: string, delta: number): string {
  const { year, month: monthNum } = parseMonth(month);
  const next = new Date(year, monthNum - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Monday-first weekday, 0-6 */
function mondayIndex(year: number, month: number, day: number): number {
  const js = new Date(year, month - 1, day).getDay();
  return (js + 6) % 7;
}

function NestedRings({
  hasMetrics,
  hasWorkout,
  hasInsight,
  children,
}: {
  hasMetrics: boolean;
  hasWorkout: boolean;
  hasInsight: boolean;
  children: ReactNode;
}) {
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center">
      <svg viewBox="0 0 32 32" className="absolute inset-0 overflow-visible" aria-hidden>
        {hasInsight ? (
          <circle cx="16" cy="16" r="14" fill="none" className="stroke-primary" strokeWidth="3" />
        ) : null}
        {hasWorkout ? (
          <circle cx="16" cy="16" r="11" fill="none" className="stroke-red-300" strokeWidth="3" />
        ) : null}
        {hasMetrics ? (
          <circle cx="16" cy="16" r="8" fill="none" className="stroke-success" strokeWidth="3" />
        ) : null}
      </svg>
      <span className="relative z-[1]">{children}</span>
    </span>
  );
}

type HealthMiniCalendarProps = {
  month: string;
  selectedDate: string | null;
  days: HealthCalendarDay[];
  today: string;
  onMonthChange: (month: string) => void;
  onSelectDate: (localDate: string) => void;
};

export function HealthMiniCalendar({
  month,
  selectedDate,
  days,
  today,
  onMonthChange,
  onSelectDate,
}: HealthMiniCalendarProps) {
  const { year, month: monthNum } = parseMonth(month);
  const byDate = useMemo(() => new Map(days.map((item) => [item.local_date, item])), [days]);
  const leading = mondayIndex(year, monthNum, 1);
  const total = daysInMonth(year, monthNum);
  const cells: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) {
    cells.push({
      date: `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section className="rounded-xl border border-border-subtle bg-white p-lg">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-small text-text-secondary hover:bg-gray-50"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          aria-label="上个月"
        >
          ‹
        </button>
        <h2 className="font-headline text-small text-text-primary">
          {year}年{monthNum}月
        </h2>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-small text-text-secondary hover:bg-gray-50"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          aria-label="下个月"
        >
          ›
        </button>
      </div>
      <div className="mt-md grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((label) => (
          <div key={label} className="text-overline text-zinc-400">
            {label}
          </div>
        ))}
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`empty-${index}`} />;
          }
          const marks = byDate.get(cell.date);
          const selected = selectedDate === cell.date;
          const isToday = cell.date === today;
          const future = cell.date > today;
          return (
            <button
              key={cell.date}
              type="button"
              disabled={future}
              onClick={() => onSelectDate(cell.date)}
              className={`flex items-center justify-center rounded-lg py-0.5 text-caption transition-[color,background-color,box-shadow] ${
                future
                  ? "cursor-not-allowed text-zinc-300"
                  : selected
                    ? "bg-primary-fixed font-semibold text-primary ring-2 ring-inset ring-primary"
                    : "text-text-primary hover:bg-gray-50"
              } ${isToday && !selected ? "font-semibold" : ""}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={selected}
              title={[
                marks?.has_metrics ? "有采集数据" : null,
                marks?.has_workout ? "有运动" : null,
                marks?.has_insight ? "有 AI 分析" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <NestedRings
                hasMetrics={Boolean(marks?.has_metrics)}
                hasWorkout={Boolean(marks?.has_workout)}
                hasInsight={Boolean(marks?.has_insight)}
              >
                {cell.day}
              </NestedRings>
            </button>
          );
        })}
      </div>
      <div className="mt-md flex flex-wrap items-center gap-3 text-caption text-neutral-muted">
        <span className="inline-flex items-center gap-1">
          <NestedRings hasMetrics hasWorkout={false} hasInsight={false}>
            <span className="sr-only">数据</span>
          </NestedRings>
          数据
        </span>
        <span className="inline-flex items-center gap-1">
          <NestedRings hasMetrics={false} hasWorkout hasInsight={false}>
            <span className="sr-only">运动</span>
          </NestedRings>
          运动
        </span>
        <span className="inline-flex items-center gap-1">
          <NestedRings hasMetrics={false} hasWorkout={false} hasInsight>
            <span className="sr-only">分析</span>
          </NestedRings>
          分析
        </span>
      </div>
    </section>
  );
}
