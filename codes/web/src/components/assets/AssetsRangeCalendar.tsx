"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAccountWeekStart } from "@/lib/use-account-week-start";
import { leadingWeekdayBlanks, weekdayHeaderLabels } from "@/lib/weekStart";

const PRESETS = [7, 30, 90] as const;

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

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

type AssetsRangeCalendarProps = {
  start: string;
  end: string;
  today: string;
  locale: string;
  changeDates: string[];
  onRangeChange: (start: string, end: string) => void;
};

export function AssetsRangeCalendar({
  start,
  end,
  today,
  locale,
  changeDates,
  onRangeChange,
}: AssetsRangeCalendarProps) {
  const t = useTranslations("assets");
  const weekStartsOn = useAccountWeekStart();
  const weekdayHeaders = weekdayHeaderLabels(weekStartsOn);
  const [month, setMonth] = useState(monthKey(end || today));
  const [awaitingEnd, setAwaitingEnd] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const changes = useMemo(() => new Set(changeDates), [changeDates]);
  const { year, month: monthNum } = parseMonth(month);
  const leading = leadingWeekdayBlanks(new Date(year, monthNum - 1, 1), weekStartsOn);
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

  const previewStart = awaitingEnd && hover ? (hover < start ? hover : start) : start;
  const previewEnd = awaitingEnd && hover ? (hover < start ? start : hover) : end;
  const span =
    start && end
      ? Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1
      : 0;
  const preset = end === today ? PRESETS.find((days) => span === days) ?? null : null;
  const monthLabel = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(year, monthNum - 1, 1),
  );

  function selectDay(day: string) {
    if (!awaitingEnd) {
      onRangeChange(day, day);
      setAwaitingEnd(true);
      return;
    }
    const nextStart = day < start ? day : start;
    const nextEnd = day < start ? start : day;
    onRangeChange(nextStart, nextEnd);
    setAwaitingEnd(false);
    setHover(null);
  }

  function applyPreset(days: number) {
    const rangeStart = shiftIso(today, -(days - 1));
    onRangeChange(rangeStart, today);
    setMonth(monthKey(today));
    setAwaitingEnd(false);
  }

  return (
    <div className="space-y-md">
      <section className="rounded-xl border border-border-subtle bg-white p-lg">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-small text-text-secondary hover:bg-gray-50"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label={t("calendar.previousMonth")}
          >
            ‹
          </button>
          <h2 className="font-headline text-small text-text-primary">{monthLabel}</h2>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-small text-text-secondary hover:bg-gray-50"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label={t("calendar.nextMonth")}
          >
            ›
          </button>
        </div>
        <div className="mt-md grid grid-cols-7 gap-y-1 text-center">
          {weekdayHeaders.map((label, index) => (
            <div key={`${label}-${index}`} className="text-overline text-zinc-400">
              {label}
            </div>
          ))}
          {cells.map((cell, index) => {
            if (!cell) return <div key={`empty-${index}`} />;
            const future = cell.date > today;
            const inRange = cell.date >= previewStart && cell.date <= previewEnd;
            const endpoint = cell.date === previewStart || cell.date === previewEnd;
            const changed = changes.has(cell.date);
            return (
              <button
                key={cell.date}
                type="button"
                disabled={future}
                onClick={() => selectDay(cell.date)}
                onMouseEnter={() => setHover(cell.date)}
                onMouseLeave={() => setHover(null)}
                className={`flex items-center justify-center rounded-lg py-0.5 text-caption transition-[color,background-color,box-shadow] ${
                  future
                    ? "cursor-not-allowed text-zinc-300"
                    : endpoint
                      ? "bg-primary-fixed font-semibold text-primary ring-2 ring-inset ring-primary"
                      : inRange
                        ? "bg-primary-fixed/70 text-text-primary"
                        : "text-text-primary hover:bg-gray-50"
                }`}
                aria-pressed={inRange}
                aria-current={cell.date === today ? "date" : undefined}
              >
                <span className="relative inline-flex h-8 w-8 items-center justify-center">
                  {changed ? (
                    <svg viewBox="0 0 32 32" className="absolute inset-0" aria-hidden>
                      <circle cx="16" cy="16" r="14" fill="none" className="stroke-primary" strokeWidth="3" />
                    </svg>
                  ) : null}
                  <span className="relative z-[1]">{cell.day}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-md flex flex-wrap items-center gap-3 text-caption text-neutral-muted">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-4 w-4 rounded bg-primary-fixed ring-2 ring-inset ring-primary" />
            {t("calendar.range")}
          </span>
          <span className="inline-flex items-center gap-1">
            <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
              <circle cx="16" cy="16" r="12" fill="none" className="stroke-primary" strokeWidth="3" />
            </svg>
            {t("calendar.changed")}
          </span>
        </div>
        <p className="mt-2 text-caption text-text-secondary">
          {awaitingEnd ? t("calendar.pickEnd") : t("calendar.pickStart")}
        </p>
      </section>
      <section className="rounded-xl border border-border-subtle bg-white px-md py-sm">
        <div className="flex items-baseline gap-sm">
          <h2 className="shrink-0 font-headline text-small text-text-primary">{t("calendar.rangeTitle")}</h2>
          <p className="min-w-0 text-caption text-neutral-muted">{t("calendar.rangeHint")}</p>
        </div>
        <div className="mt-sm grid grid-cols-3 gap-sm">
          {PRESETS.map((days) => {
            const active = preset === days;
            return (
              <button
                key={days}
                type="button"
                onClick={() => applyPreset(days)}
                className={
                  active
                    ? "rounded-lg bg-primary px-2 py-1.5 text-caption font-medium text-on-primary"
                    : "rounded-lg border border-border-subtle bg-white px-2 py-1.5 text-caption text-text-secondary hover:bg-gray-50"
                }
                aria-pressed={active}
              >
                {t("calendar.days", { count: days })}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function defaultRangeEnd(today: string): string {
  return today;
}

export function defaultRangeStart(today: string): string {
  return shiftIso(today, -89);
}
