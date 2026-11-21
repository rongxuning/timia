"use client";

import { useMemo, useState } from "react";
import { chartAxisDates, formatChartDate, nearestChartIndex, pointerXInViewBox } from "@/components/assets/assetChartRange";

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

export type TrendSeries = {
  id: string;
  label: string;
  tone: string;
  values: Array<number | null>;
  /** Series that share a scale are drawn against one axis. */
  scale?: string;
  formatValue?: (value: number | null) => string;
};

type StockTrendChartProps = {
  categories: string[];
  series: TrendSeries[];
  locale: string;
  formatMoney: (amountMinor: number) => string;
};

export function StockTrendChart({ categories, series, locale, formatMoney }: StockTrendChartProps) {
  const layout = useMemo(() => layoutTrend(categories, series), [categories, series]);
  const ticks = useMemo(() => axisTicks(categories), [categories]);
  const [hover, setHover] = useState<number | null>(null);
  if (!layout || categories.length === 0) return null;
  const index = Math.min(hover ?? categories.length - 1, categories.length - 1);

  function moveTo(offsetX: number, width: number, height: number) {
    if (!layout) return;
    const x = pointerXInViewBox(offsetX, width, height, WIDTH, HEIGHT);
    setHover(nearestChartIndex(layout.coords, x));
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((item) => (
          <span key={item.id} className={`text-caption ${item.tone}`}>
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-caption text-text-secondary">{formatChartDate(categories[index], locale)}</p>
      <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {series.map((item) => (
          <li key={item.id} className="flex items-baseline justify-between gap-2 text-caption">
            <span className="text-text-secondary">{item.label}</span>
            <span className={`tabular-nums ${item.tone}`}>
              {item.formatValue ? item.formatValue(item.values[index] ?? null) : formatMoney(item.values[index] ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-2 h-52 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
        tabIndex={0}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          moveTo(event.clientX - rect.left, rect.width, rect.height);
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const current = hover ?? categories.length - 1;
          const next = event.key === "ArrowLeft" ? Math.max(0, current - 1) : Math.min(categories.length - 1, current + 1);
          setHover(next);
        }}
      >
        {layout.zeroY != null ? (
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={layout.zeroY}
            y2={layout.zeroY}
            className="stroke-current text-text-secondary opacity-30"
            strokeDasharray="3 3"
          />
        ) : null}
        {layout.lines.map((line) => (
          <path
            key={line.id}
            d={line.d}
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            className={`stroke-current ${line.tone}`}
          />
        ))}
        <line
          x1={layout.coords[index].x}
          x2={layout.coords[index].x}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
          className="stroke-current text-text-secondary opacity-40"
        />
      </svg>
      <div className="relative h-5 text-caption text-neutral-muted">
        {ticks.map((tick) => (
          <span key={tick.date} className={`absolute top-0 whitespace-nowrap ${tick.align}`} style={tick.style}>
            {formatChartDate(tick.date, locale)}
          </span>
        ))}
      </div>
    </div>
  );
}

function axisTicks(categories: string[]) {
  const last = categories.length - 1;
  return chartAxisDates(categories).map((date) => {
    const index = Math.max(0, categories.indexOf(date));
    const ratio = last <= 0 ? 0 : index / last;
    if (index === 0) return { date, align: "left-0", style: undefined };
    if (index === last) return { date, align: "right-0", style: undefined };
    return { date, align: "-translate-x-1/2", style: { left: `${ratio * 100}%` } };
  });
}

function layoutTrend(categories: string[], series: TrendSeries[]) {
  if (categories.length === 0 || series.length === 0) return null;
  const grouped = new Map<string, number[]>();
  for (const item of series) {
    const key = item.scale ?? "money";
    const bucket = grouped.get(key) ?? [];
    for (const value of item.values) {
      if (value != null) bucket.push(value);
    }
    grouped.set(key, bucket);
  }
  if ([...grouped.values()].every((values) => values.length === 0)) return null;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const yFor = new Map<string, (value: number) => number>();
  const domains = new Map<string, { min: number; max: number }>();
  for (const [key, values] of grouped) {
    const bounds = domain(values.length > 0 ? values : [0]);
    domains.set(key, bounds);
    const span = bounds.max - bounds.min;
    yFor.set(key, (value) => PAD.top + (1 - (value - bounds.min) / span) * innerH);
  }
  const coords = categories.map((as_of, index) => ({
    as_of,
    x: categories.length === 1 ? PAD.left + innerW / 2 : PAD.left + (index / (categories.length - 1)) * innerW,
  }));
  const lines = series.map((item) => {
    const yOf = yFor.get(item.scale ?? "money");
    let path = "";
    let drawing = false;
    if (!yOf) return { id: item.id, tone: item.tone, d: path };
    coords.forEach((point, index) => {
      const value = item.values[index];
      if (value == null) {
        drawing = false;
        return;
      }
      path += `${drawing ? "L" : "M"}${point.x.toFixed(2)} ${yOf(value).toFixed(2)}`;
      drawing = true;
    });
    return { id: item.id, tone: item.tone, d: path };
  });
  let zeroY: number | null = null;
  if (grouped.size === 1) {
    const [key, bounds] = [...domains.entries()][0];
    const yOf = yFor.get(key);
    if (bounds && yOf && bounds.min < 0 && bounds.max > 0) zeroY = yOf(0);
  }
  return { coords, lines, zeroY };
}

function domain(values: number[]) {
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) {
    min -= 1;
    max += 1;
  } else {
    const slack = (max - min) * 0.08;
    min -= slack;
    max += slack;
  }
  return { min, max };
}
