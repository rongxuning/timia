"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  buildCalendarCells,
  formatChartDate,
  formatMonthTitle,
  monthKey,
  shiftMonth,
  weekdayHeaderLabels,
  type DateRange,
} from "@/components/assets/assetChartRange";

type AssetRangeCalendarProps = {
  month: string;
  today: string;
  range: DateRange;
  pending: string | null;
  locale: string;
  weekStartsOn: number;
  onMonthChange: (delta: number) => void;
  onPick: (date: string) => void;
  onCancelPending: () => void;
};

export function AssetRangeCalendar({
  month,
  today,
  range,
  pending,
  locale,
  weekStartsOn,
  onMonthChange,
  onPick,
  onCancelPending,
}: AssetRangeCalendarProps) {
  const t = useTranslations("assets");
  const headers = weekdayHeaderLabels(locale, weekStartsOn);
  const cells = buildCalendarCells(month, weekStartsOn);
  const canGoNext = shiftMonth(month, 1) <= monthKey(today);
  const rangeLabel = t("calendar.range", {
    start: formatChartDate(range.start, locale),
    end: formatChartDate(range.end, locale),
  });

  useEffect(() => {
    if (!pending) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancelPending();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancelPending, pending]);

  return (
    <section className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm" aria-label={rangeLabel}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          onClick={() => onMonthChange(-1)}
          aria-label={t("calendar.prevMonth")}
        >
          <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
            chevron_left
          </span>
        </button>
        <h2 className="font-headline text-small text-text-primary">{formatMonthTitle(month, locale)}</h2>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onMonthChange(1)}
          disabled={!canGoNext}
          aria-label={t("calendar.nextMonth")}
        >
          <span className="material-symbols-outlined text-[20px] leading-none" aria-hidden>
            chevron_right
          </span>
        </button>
      </div>
      <div className="mt-md grid grid-cols-7 gap-y-1 text-center">
        {headers.map((label, index) => (
          <div key={`${label}-${index}`} className="text-overline text-zinc-400">
            {label}
          </div>
        ))}
        {cells.map((cell, index) => {
          if (!cell) return <div key={`empty-${month}-${index}`} />;
          const future = cell.date > today;
          const isToday = cell.date === today;
          const isPending = pending === cell.date;
          const inRange = cell.date >= range.start && cell.date <= range.end;
          const isEdge = inRange && (cell.date === range.start || cell.date === range.end);
          const tone = future
            ? "cursor-not-allowed text-zinc-300"
            : isPending || isEdge
              ? "bg-primary font-semibold text-on-primary"
              : inRange
                ? "bg-primary-fixed text-primary"
                : "text-text-primary hover:bg-gray-50";
          return (
            <button
              key={cell.date}
              type="button"
              disabled={future}
              onClick={() => onPick(cell.date)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={!future && (isPending || inRange)}
              className={`flex h-8 items-center justify-center rounded-lg text-caption tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${tone} ${
                isToday && !isEdge && !isPending ? "font-semibold text-primary" : ""
              }`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
      <p className="mt-md text-caption text-text-secondary">{rangeLabel}</p>
      {pending ? <p className="mt-1 text-caption text-primary">{t("calendar.pickEnd")}</p> : null}
    </section>
  );
}
