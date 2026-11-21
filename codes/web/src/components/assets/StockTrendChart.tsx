"use client";

import { useMemo, useState } from "react";
import { chartAxisDates, formatChartDate, nearestChartIndex, pointerXInViewBox } from "@/components/assets/assetChartRange";
import { layoutStockTrend, type TrendDirection, type TrendDot } from "@/components/assets/stockTrendLayout";

export type TrendSeries = {
  id: string;
  label: string;
  tone: string;
  values: Array<number | null>;
  /** Series that share a scale are drawn against one axis. */
  scale?: string;
  /** Color the readout by sign: a gain is red and a loss is green. */
  signed?: boolean;
  formatValue?: (value: number | null) => string;
};

type StockTrendChartProps = {
  categories: string[];
  series: TrendSeries[];
  locale: string;
  formatMoney: (amountMinor: number) => string;
};

const DIRECTION_TONE: Record<TrendDirection, string> = {
  up: "text-error",
  down: "text-success",
  flat: "text-text-secondary",
};

export function StockTrendChart({ categories, series, locale, formatMoney }: StockTrendChartProps) {
  const layout = useMemo(() => layoutStockTrend(categories, series), [categories, series]);
  const [hover, setHover] = useState<number | null>(null);
  if (!layout || categories.length === 0) return null;
  const index = Math.min(hover ?? categories.length - 1, categories.length - 1);
  const activeX = layout.coords[index]?.x ?? layout.plot.left;
  const dateLabels = chartAxisDates(categories);
  const xTicks = dateLabels.flatMap((date, labelIndex) => {
    const tick = layout.xTicks.find((item) => item.date === date);
    if (!tick) return [];
    const anchor = labelIndex === 0 ? "start" : labelIndex === dateLabels.length - 1 ? "end" : "middle";
    return [{ ...tick, anchor }];
  });

  function moveTo(offsetX: number, width: number, height: number) {
    if (!layout) return;
    const x = pointerXInViewBox(offsetX, width, height, layout.width, layout.height);
    setHover(nearestChartIndex(layout.coords, x));
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((item) => (
          <span key={item.id} className={`text-caption ${valueTone(item, item.values[index] ?? null)}`}>
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-caption text-text-secondary">{formatChartDate(categories[index], locale)}</p>
      <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {series.map((item) => {
          const value = item.values[index] ?? null;
          return (
            <li key={item.id} className="flex items-baseline justify-between gap-2 text-caption">
              <span className="text-text-secondary">{item.label}</span>
              <span className={`tabular-nums ${valueTone(item, value)}`}>
                {item.formatValue ? item.formatValue(value) : formatMoney(value ?? 0)}
              </span>
            </li>
          );
        })}
      </ul>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="mt-2 h-56 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
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
        {layout.grid.map((line) => (
          <line
            key={`grid-${line.y1}`}
            x1={line.x1}
            x2={line.x2}
            y1={line.y1}
            y2={line.y2}
            strokeDasharray="4 3"
            className="stroke-current text-text-secondary opacity-30"
          />
        ))}
        {layout.dayGuides.map((line) => (
          <line
            key={`day-${line.x1}`}
            x1={line.x1}
            x2={line.x2}
            y1={line.y1}
            y2={line.y2}
            strokeDasharray="2 3"
            className="stroke-current text-text-secondary opacity-25"
          />
        ))}
        <line
          x1={layout.axisX.x1}
          x2={layout.axisX.x2}
          y1={layout.axisX.y1}
          y2={layout.axisX.y2}
          className="stroke-current text-text-primary"
        />
        <line
          x1={layout.axisY.x1}
          x2={layout.axisY.x2}
          y1={layout.axisY.y1}
          y2={layout.axisY.y2}
          className="stroke-current text-text-primary"
        />
        {layout.yTicks.map((tick) => (
          <text
            key={`y-${tick.value}`}
            x={layout.plot.left - 8}
            y={tick.y + 3}
            textAnchor="end"
            className="fill-current text-[10px] text-text-secondary"
          >
            {formatMoney(tick.value)}
          </text>
        ))}
        {xTicks.map((tick) => (
          <text
            key={`x-${tick.date}`}
            x={tick.x}
            y={layout.height - 8}
            textAnchor={tick.anchor}
            className="fill-current text-[10px] text-text-secondary"
          >
            {formatChartDate(tick.date, locale)}
          </text>
        ))}
        {layout.segments.map((segment) => (
          <line
            key={segment.id}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            strokeWidth="2"
            className={`stroke-current ${DIRECTION_TONE[segment.direction]}`}
          />
        ))}
        {layout.dots.map((dot) => (
          <circle key={dot.id} cx={dot.cx} cy={dot.cy} r="3.5" className="fill-current text-primary" />
        ))}
        {pointLabels(layout.dots, index).map((dot) => {
          const item = series.find((entry) => entry.id === dot.seriesId);
          const text = item?.formatValue ? item.formatValue(dot.value) : formatMoney(dot.value);
          const placeLeft = dot.cx > layout.plot.right - 88;
          return (
            <text
              key={`label-${dot.id}`}
              x={placeLeft ? dot.cx - 6 : dot.cx + 6}
              y={dot.labelY}
              textAnchor={placeLeft ? "end" : "start"}
              className={`fill-current text-[10px] ${item ? valueTone(item, dot.value) : "text-text-primary"}`}
            >
              {text}
            </text>
          );
        })}
        <line
          x1={activeX}
          x2={activeX}
          y1={layout.plot.top}
          y2={layout.plot.bottom}
          className="stroke-current text-text-primary opacity-50"
        />
      </svg>
    </div>
  );
}

function pointLabels(dots: TrendDot[], index: number): Array<TrendDot & { labelY: number }> {
  const active = dots.filter((dot) => dot.index === index).sort((left, right) => left.cy - right.cy);
  let lastY = Number.NEGATIVE_INFINITY;
  return active.map((dot) => {
    const labelY = Math.max(dot.cy + 3, lastY + 11);
    lastY = labelY;
    return { ...dot, labelY };
  });
}

function valueTone(item: TrendSeries, value: number | null): string {
  if (!item.signed) return item.tone;
  if (value == null || value === 0) return "text-text-primary";
  return value > 0 ? "text-error" : "text-success";
}
