"use client";

import { useMemo, useState } from "react";
import {
  chartPointDateLabels,
  formatChartDate,
  formatChartMonth,
  nearestChartIndex,
  pointerXInViewBox,
} from "@/components/assets/assetChartRange";
import { layoutStockTrend, type TrendDirection, type TrendPaint, type TrendSegment } from "@/components/assets/stockTrendLayout";

export type TrendSwatch = {
  tone: string;
  /** Visible name for this color, when one curve uses more than one. */
  label?: string;
};

export type TrendSeries = {
  id: string;
  label: string;
  tone: string;
  values: Array<number | null>;
  /** Series that share a scale are drawn against one axis. */
  scale?: string;
  /** Color the readout by sign: a gain is red and a loss is green. */
  signed?: boolean;
  /** `solid` uses `tone`. `signed` is red in profit and green in loss. Omitted stays up-red / down-green. */
  paint?: TrendPaint;
  /** Readout color when it should not follow the line. Small text cannot use a yellow stroke. */
  readout?: string;
  /** Readout-only series stay out of the plot. */
  drawn?: boolean;
  /** SVG stroke dash. The color key repeats it so the swatch matches the line. */
  dash?: string;
  /** Color key drawn under the readout. */
  key?: TrendSwatch[];
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
  const legend = series.filter((item) => item.key && item.key.length > 0);
  const dateLabels = chartPointDateLabels(categories);
  const xTicks = dateLabels.flatMap((label, labelIndex) => {
    const tick = layout.xTicks[labelIndex];
    if (!tick || tick.date !== label.date) return [];
    const anchor: "start" | "middle" | "end" =
      labelIndex === 0 ? "start" : labelIndex === dateLabels.length - 1 ? "end" : "middle";
    return [{ ...tick, anchor, day: label.day, month: label.month }];
  });

  function moveTo(offsetX: number, width: number, height: number) {
    if (!layout) return;
    const x = pointerXInViewBox(offsetX, width, height, layout.width, layout.height);
    setHover(nearestChartIndex(layout.coords, x));
  }

  return (
    <div className="w-full min-w-0 rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
      <div className="flex flex-col gap-lg sm:flex-row sm:items-stretch">
        <aside className="w-full shrink-0 space-y-2 sm:w-44">
          <p className="text-caption text-text-secondary">{formatChartDate(categories[index], locale)}</p>
          <ul className="space-y-1.5">
            {series.map((item) => {
              const value = item.values[index] ?? null;
              return (
                <li key={item.id} className="min-w-0">
                  <p className={`text-caption ${readoutTone(item, value)}`}>{item.label}</p>
                  <p className={`truncate text-small tabular-nums ${readoutTone(item, value)}`}>
                    {item.formatValue ? item.formatValue(value) : value == null ? "—" : formatMoney(value)}
                  </p>
                </li>
              );
            })}
          </ul>
          {legend.length > 0 ? (
            <ul className="space-y-1.5 border-t border-border-subtle pt-3">
              {legend.map((item) => (
                <LegendRow key={item.id} item={item} />
              ))}
            </ul>
          ) : null}
        </aside>
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto min-h-48 w-full min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40"
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
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              className="stroke-outline-variant"
            />
          ))}
          {layout.dayGuides.map((line) => (
            <line
              key={`day-${line.x1}`}
              x1={line.x1}
              x2={line.x2}
              y1={line.y1}
              y2={line.y2}
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              className="stroke-outline-variant"
            />
          ))}
          <line
            x1={layout.axisX.x1}
            x2={layout.axisX.x2}
            y1={layout.axisX.y1}
            y2={layout.axisX.y2}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className="stroke-on-surface-variant"
          />
          <line
            x1={layout.axisY.x1}
            x2={layout.axisY.x2}
            y1={layout.axisY.y1}
            y2={layout.axisY.y2}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            className="stroke-on-surface-variant"
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
            <g key={`x-${tick.date}`}>
              {tick.month ? (
                <text
                  x={tick.x}
                  y={layout.height - 22}
                  textAnchor={tick.anchor}
                  className="fill-current text-[10px] text-text-secondary"
                >
                  {formatChartMonth(tick.date, locale)}
                </text>
              ) : null}
              <text
                x={tick.x}
                y={layout.height - 8}
                textAnchor={tick.anchor}
                className="fill-current text-[10px] text-text-secondary"
              >
                {tick.day}
              </text>
            </g>
          ))}
          {layout.segments.map((segment) => (
            <line
              key={segment.id}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              strokeWidth="2"
              strokeDasharray={segment.dash}
              vectorEffect="non-scaling-stroke"
              className={`stroke-current ${segmentTone(segment, series)}`}
              style={{ forcedColorAdjust: "none" }}
            />
          ))}
          {layout.dots.map((dot) => {
            const item = series.find((entry) => entry.id === dot.seriesId);
            return (
              <circle
                key={dot.id}
                cx={dot.cx}
                cy={dot.cy}
                r="3.5"
                className={`fill-current ${item ? markTone(item, dot.value) : "text-primary"}`}
                style={{ forcedColorAdjust: "none" }}
              />
            );
          })}
          <line
            x1={activeX}
            x2={activeX}
            y1={layout.plot.top}
            y2={layout.plot.bottom}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="stroke-on-surface-variant opacity-60"
          />
        </svg>
      </div>
    </div>
  );
}

function LegendRow({ item }: { item: TrendSeries }) {
  const swatches = item.key ?? [];
  const named = swatches.some((swatch) => swatch.label);
  if (!named) {
    const swatch = swatches[0];
    if (!swatch) return null;
    return (
      <li className="flex items-center gap-2 text-caption text-text-primary">
        <ColorMark tone={swatch.tone} dashed={Boolean(item.dash)} />
        <span className="min-w-0 truncate">{item.label}</span>
      </li>
    );
  }
  return (
    <li className="space-y-1 text-caption">
      <p className="text-text-primary">{item.label}</p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-text-secondary">
        {swatches.map((swatch) => (
          <span key={`${swatch.tone}-${swatch.label ?? ""}`} className="inline-flex items-center gap-1">
            <ColorMark tone={swatch.tone} />
            {swatch.label}
          </span>
        ))}
      </p>
    </li>
  );
}

function ColorMark({ tone, dashed = false }: { tone: string; dashed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block w-5 shrink-0 border-t-2 border-current ${dashed ? "border-dashed" : ""} ${tone}`}
      style={{ forcedColorAdjust: "none" }}
    />
  );
}

function readoutTone(item: TrendSeries, value: number | null): string {
  if (item.signed) {
    if (value == null || value === 0) return "text-text-primary";
    return value > 0 ? "text-error" : "text-success";
  }
  return item.readout ?? item.tone;
}

function markTone(item: TrendSeries, value: number): string {
  if (item.paint === "signed" || item.signed) {
    if (value > 0) return "text-error";
    if (value < 0) return "text-success";
    return "text-text-primary";
  }
  return item.tone;
}

function segmentTone(segment: TrendSegment, series: TrendSeries[]): string {
  if (segment.paint === "solid") {
    return series.find((item) => item.id === segment.seriesId)?.tone ?? "text-text-primary";
  }
  if (segment.paint === "signed") {
    if (segment.sign === "profit") return "text-error";
    if (segment.sign === "loss") return "text-success";
    return "text-text-secondary";
  }
  return DIRECTION_TONE[segment.direction];
}
