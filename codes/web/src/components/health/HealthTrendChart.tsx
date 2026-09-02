"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  scoreBandsForScale,
  SCORE_BAND_FILL,
  type ScoreScale,
} from "@/components/health/healthScoreBands";
import {
  addDays,
  applySeriesAnchor,
  calendarXAt,
  formatAxisDate,
  formatAxisNumber,
  padSeriesToRange,
  rangeTickDays,
} from "@/components/health/healthTrendAxis";
import type { HealthSeriesPoint } from "@/types/api/views/health";

export type TrendHourPoint = {
  hour: number;
  value?: number | null;
};

export type TrendXLabel = {
  at: number;
  label: string;
};

type HealthTrendChartProps = {
  points: HealthSeriesPoint[];
  scale: ScoreScale;
  className?: string;
  rangeDays?: number | null;
  rangeEnd?: string | null;
  formatY?: (value: number) => string;
  variant?: "detail" | "card";
  anchor?: { local_date: string; value: number | null | undefined } | null;
  hours?: TrendHourPoint[] | null;
};

type PlotPoint = {
  x: number;
  y: number;
  label: string;
};

type HoverPoint = PlotPoint & {
  left: number;
  top: number;
};

export function HealthTrendChart({
  points,
  scale,
  className,
  rangeDays,
  rangeEnd,
  formatY,
  variant = "detail",
  anchor,
  hours,
}: HealthTrendChartProps) {
  const rangeMode = Boolean(rangeDays && rangeDays > 1);
  const hourly = !rangeMode ? (hours ?? []).filter((point) => point.value != null) : [];
  if (hourly.length > 0) {
    return (
      <TrendPlot
        values={hourly.map((point) => point.value as number)}
        plotPoints={hourly.map((point) => ({
          x: (point.hour / 24) * 100,
          y: point.value as number,
          label: `${point.hour}时`,
        }))}
        xTicks={hourXTicks(variant === "card")}
        scale={scale}
        formatY={formatY}
        variant={variant}
        className={className}
      />
    );
  }

  const windowDays = rangeMode ? (rangeDays as number) : 1;
  const end = rangeEnd ?? points[points.length - 1]?.local_date ?? null;
  const padded = end
    ? padSeriesToRange(applySeriesAnchor(points, rangeMode ? null : anchor), windowDays, end)
    : applySeriesAnchor(points, rangeMode ? null : anchor);
  const valued = padded.filter((point): point is HealthSeriesPoint & { value: number } => point.value != null);
  if (valued.length === 0) {
    return (
      <p
        className={`flex h-full w-full items-center justify-end text-caption text-neutral-muted ${
          variant === "card" ? "min-h-[4.5rem]" : "min-h-[12rem]"
        }`}
      >
        暂无趋势
      </p>
    );
  }
  const calendarEnd = padded[padded.length - 1]?.local_date ?? valued[valued.length - 1].local_date;
  const calendarStart = padded[0]?.local_date ?? addDays(calendarEnd, -(windowDays - 1));
  const xAt = (iso: string) => calendarXAt(iso, calendarStart, calendarEnd);
  return (
    <TrendPlot
      values={valued.map((point) => point.value)}
      plotPoints={valued.map((point) => ({
        x: xAt(point.local_date),
        y: point.value,
        label: formatAxisDate(point.local_date),
      }))}
      xTicks={buildDateXTicks({ calendarStart, windowDays, compact: variant === "card" })}
      scale={scale}
      formatY={formatY}
      variant={variant}
      className={className}
    />
  );
}

function TrendPlot({
  values,
  plotPoints,
  xTicks,
  scale,
  formatY,
  variant,
  className,
}: {
  values: number[];
  plotPoints: PlotPoint[];
  xTicks: TrendXLabel[];
  scale: ScoreScale;
  formatY?: (value: number) => string;
  variant: "detail" | "card";
  className?: string;
}) {
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin = Math.min(0, dataMin);
  const padTop = Math.max(0, dataMin);
  const yMax = Math.max(dataMax + padTop, yMin + 1);
  const span = yMax - yMin || 1;
  const yAt = (value: number) => (1 - (value - yMin) / span) * 100;
  const d = plotPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${yAt(point.y).toFixed(2)}`)
    .join(" ");
  const labelOf = formatY ?? formatAxisNumber;
  const near = (a: number, b: number) => Math.abs(a - b) / span < 0.08;
  const yTicks = [
    { value: dataMax, label: labelOf(dataMax) },
    { value: 0, label: labelOf(0) },
    { value: dataMin, label: labelOf(dataMin) },
  ].filter((tick, index, all) => all.findIndex((item) => near(item.value, tick.value)) === index);
  const bipolar = scale.kind === "rhr" || scale.kind === "sleep";
  const bands = [
    ...scoreBandsForScale(scale, yMin, bipolar ? yMax : dataMax),
    ...(!bipolar && yMax > dataMax ? [{ y0: dataMax, y1: yMax, tone: "high" as const }] : []),
  ];
  const zeroInside = yMin < 0 && yMax > 0;
  const markers = markerPoints(plotPoints, xTicks, variant);
  const active = hover ?? markers[markers.length - 1] ?? null;
  const compact = variant === "card";
  const dotClass = compact ? "h-1 w-1" : "h-1.5 w-1.5";
  const activeDotClass = compact ? "h-1.5 w-1.5" : "h-2 w-2";

  return (
    <div className={className ?? "flex h-48 w-full text-primary"}>
      <div className={`flex w-auto shrink-0 flex-col pr-sm pb-4 ${compact ? "min-w-[1.75rem]" : "min-w-[2rem]"}`}>
        <div className="relative min-h-0 flex-1">
          {yTicks.map((tick) => (
            <span
              key={`${tick.value}-${tick.label}`}
              className="absolute left-0 font-caption text-caption leading-none text-neutral-muted tabular-nums"
              style={{ top: `${yAt(tick.value)}%`, transform: "translateY(-50%)" }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="relative min-h-0 flex-1"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const at = ((event.clientX - rect.left) / rect.width) * 100;
            const point = nearestPoint(plotPoints, at);
            setHover({
              ...point,
              left: rect.left + (point.x / 100) * rect.width,
              top: rect.top + (yAt(point.y) / 100) * rect.height,
            });
          }}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            {bands.map((band) => {
              const top = yAt(band.y1);
              const height = yAt(band.y0) - top;
              return (
                <rect
                  key={`${band.tone}-${band.y0}-${band.y1}`}
                  x="0"
                  y={top}
                  width="100"
                  height={Math.max(0, height)}
                  fill={SCORE_BAND_FILL[band.tone]}
                />
              );
            })}
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="100"
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1="0"
              y1="100"
              x2="100"
              y2="100"
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {zeroInside ? (
              <line
                x1="0"
                y1={yAt(0)}
                x2="100"
                y2={yAt(0)}
                stroke="currentColor"
                strokeOpacity="0.28"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {hover ? (
              <line
                x1={hover.x}
                y1="0"
                x2={hover.x}
                y2="100"
                stroke="currentColor"
                strokeOpacity="0.35"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {markers.map((point) => (
            <span
              key={`m-${point.label}-${point.x}`}
              className={`pointer-events-none absolute rounded-full bg-current ${dotClass}`}
              style={{
                left: `${point.x}%`,
                top: `${yAt(point.y)}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
          {active ? (
            <span
              className={`pointer-events-none absolute z-[1] rounded-full bg-current ${activeDotClass}`}
              style={{
                left: `${active.x}%`,
                top: `${yAt(active.y)}%`,
                transform: "translate(-50%, -50%)",
              }}
            />
          ) : null}
          {hover
            ? createPortal(
                <span
                  role="tooltip"
                  className="pointer-events-none fixed z-[80] whitespace-nowrap rounded-md border border-border-subtle bg-white px-sm py-0.5 font-caption text-caption leading-tight text-text-primary shadow-md tabular-nums"
                  style={{
                    left: hover.left,
                    top: hover.top,
                    transform:
                      hover.x >= 72
                        ? "translate(-100%, calc(-100% - 8px))"
                        : hover.x <= 12
                          ? "translate(0, calc(-100% - 8px))"
                          : "translate(-50%, calc(-100% - 8px))",
                  }}
                >
                  {hover.label} · {labelOf(hover.y)}
                </span>,
                document.body,
              )
            : null}
        </div>
        <div className="relative h-4">
          {xTicks.map((tick) => (
            <span
              key={`${tick.at}-${tick.label}`}
              className="absolute top-0 whitespace-nowrap font-caption text-caption leading-none text-neutral-muted"
              style={{
                left: `${tick.at}%`,
                transform:
                  tick.at <= 1 ? "none" : tick.at >= 99 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function markerPoints(plotPoints: PlotPoint[], xTicks: TrendXLabel[], variant: "detail" | "card"): PlotPoint[] {
  if (variant === "detail") return plotPoints;
  const tickLabels = new Set(xTicks.map((tick) => tick.label));
  const out: PlotPoint[] = [];
  const seen = new Set<string>();
  const add = (point: PlotPoint) => {
    const key = `${point.label}-${point.x}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(point);
  };
  for (const point of plotPoints) {
    if (tickLabels.has(point.label)) add(point);
  }
  if (plotPoints.length > 0) add(plotPoints[plotPoints.length - 1]);
  return out;
}

function nearestPoint(plotPoints: PlotPoint[], at: number): PlotPoint {
  let best = plotPoints[0];
  let bestDist = Infinity;
  for (const point of plotPoints) {
    const dist = Math.abs(point.x - at);
    if (dist < bestDist) {
      best = point;
      bestDist = dist;
    }
  }
  return best;
}

function hourXTicks(compact: boolean): TrendXLabel[] {
  const hours = compact ? [0, 24] : [0, 6, 12, 18, 24];
  return hours.map((hour) => ({
    at: (hour / 24) * 100,
    label: `${hour}时`,
  }));
}

function buildDateXTicks({
  calendarStart,
  windowDays,
  compact,
}: {
  calendarStart: string;
  windowDays: number;
  compact: boolean;
}): TrendXLabel[] {
  if (windowDays <= 1) {
    return [{ at: 50, label: formatAxisDate(calendarStart) }];
  }
  const days = compact ? [1, windowDays] : rangeTickDays(windowDays);
  return days.map((day) => ({
    at: ((day - 1) / Math.max(1, windowDays - 1)) * 100,
    label: formatAxisDate(addDays(calendarStart, day - 1)),
  }));
}
