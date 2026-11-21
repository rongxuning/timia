"use client";

import { useMemo, useState } from "react";
import { formatChartDate, nearestChartIndex, pointerXInViewBox } from "@/components/assets/assetChartRange";

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 12 };

export type TrendSeries = {
  id: string;
  label: string;
  tone: string;
  values: number[];
};

type StockTrendChartProps = {
  categories: string[];
  series: TrendSeries[];
  locale: string;
  formatMoney: (amountMinor: number) => string;
};

export function StockTrendChart({ categories, series, locale, formatMoney }: StockTrendChartProps) {
  const layout = useMemo(() => layoutTrend(categories, series), [categories, series]);
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
            <span className={`tabular-nums ${item.tone}`}>{formatMoney(item.values[index] ?? 0)}</span>
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
      <div className="flex justify-between text-caption text-neutral-muted">
        <span>{formatChartDate(categories[0], locale)}</span>
        <span>{formatChartDate(categories[categories.length - 1], locale)}</span>
      </div>
    </div>
  );
}

function layoutTrend(categories: string[], series: TrendSeries[]) {
  if (categories.length === 0 || series.length === 0) return null;
  const values = series.flatMap((item) => item.values);
  if (values.length === 0) return null;
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
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const span = max - min;
  const yOf = (value: number) => PAD.top + (1 - (value - min) / span) * innerH;
  const coords = categories.map((as_of, index) => ({
    as_of,
    value: 0,
    x: categories.length === 1 ? PAD.left + innerW / 2 : PAD.left + (index / (categories.length - 1)) * innerW,
    y: yOf(0),
  }));
  const lines = series.map((item) => ({
    id: item.id,
    tone: item.tone,
    d: coords
      .map((point, index) => {
        const y = yOf(item.values[index] ?? 0);
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" "),
  }));
  const zeroY = min < 0 && max > 0 ? yOf(0) : null;
  return { coords, lines, zeroY };
}
