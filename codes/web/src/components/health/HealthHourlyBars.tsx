"use client";

import { useState } from "react";

import { HealthEmptyHint } from "@/components/health/HealthChartFrame";
import { workoutActivityStyle } from "@/components/health/workoutActivity";

export type HealthHourPoint = {
  hour: number;
  value?: number | null;
  min?: number | null;
  max?: number | null;
};

export type HealthHourlyWorkout = {
  start_at: string;
  end_at: string;
  activity_type: string;
  activity_type_raw?: string | null;
};

type HealthHourlyBarsProps = {
  points: HealthHourPoint[];
  format?: (value: number) => string;
  hoverFormat?: (value: number) => string;
  hoverLines?: (point: HealthHourPoint) => string[];
  showBand?: boolean;
  workouts?: HealthHourlyWorkout[];
  timezone?: string;
};

const AXIS_CLASS = "font-caption text-caption leading-none text-neutral-muted tabular-nums";
const X_TICKS = [0, 6, 12, 18, 24];

export function HealthHourlyBars({
  points,
  format,
  hoverFormat,
  hoverLines,
  showBand,
  workouts,
  timezone = "Asia/Shanghai",
}: HealthHourlyBarsProps) {
  const valued = points.filter((point) => point.value != null);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  if (valued.length === 0) {
    return <HealthEmptyHint text="这一天还没有可绘制的分布。" />;
  }
  const values = valued.map((point) => point.value as number);
  const bandMax = Math.max(
    ...values,
    ...points.map((point) => point.max).filter((value): value is number => value != null),
    0,
  );
  const yMax = bandMax || 1;
  const label = format ?? ((value: number) => String(Math.round(value)));
  const hoverLabel = hoverFormat ?? label;
  const multiHover = Boolean(hoverLines);
  const overlays = (workouts ?? []).flatMap((workout) => {
    const start = hourOfDay(workout.start_at, timezone);
    let end = hourOfDay(workout.end_at, timezone);
    if (end <= start) end += 24;
    const style = workoutActivityStyle(workout.activity_type, workout.activity_type_raw);
    const ranges = end <= 24 ? [[start, end]] : [[start, 24], [0, end - 24]];
    return ranges
      .map(([lo, hi], index) => ({
        lo: Math.max(0, lo),
        hi: Math.min(24, hi),
        color: style.band,
        label: style.label,
        key: `${workout.start_at}-${index}`,
      }))
      .filter((item) => item.hi > item.lo);
  });
  const hasOverlays = overlays.length > 0;
  const head = hasOverlays ? 24 : multiHover ? 40 : 16;
  const overlayTop = hasOverlays ? 12 : head;
  const yAt = (value: number) => head + (1 - value / yMax) * (100 - head);
  const byHour = new Map(points.map((point) => [point.hour, point]));
  const hoverPoint = hoverHour == null ? null : byHour.get(hoverHour);
  const hoverValue = hoverPoint?.value;
  const showHover = hoverValue != null && (showBand || hoverValue > 0);
  const hoverAnchor =
    showBand && hoverPoint?.max != null ? hoverPoint.max : hoverValue;
  const hoverText = hoverPoint && hoverLines ? hoverLines(hoverPoint) : null;

  return (
    <div className={`flex w-full overflow-visible text-primary ${multiHover ? "h-56" : "h-40"}`}>
      <div className="flex w-auto min-w-[2rem] shrink-0 flex-col pb-4 pr-sm">
        <div className="relative min-h-0 flex-1">
          <span
            className={`absolute left-0 ${AXIS_CLASS}`}
            style={{ top: `${yAt(yMax)}%`, transform: "translateY(-50%)" }}
          >
            {label(yMax)}
          </span>
          <span
            className={`absolute left-0 ${AXIS_CLASS}`}
            style={{ top: `${yAt(0)}%`, transform: "translateY(-50%)" }}
          >
            {label(0)}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-visible">
        <div
          className="relative min-h-0 flex-1 overflow-visible"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            if (rect.width <= 0) return;
            const hour = Math.min(
              23,
              Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * 24)),
            );
            setHoverHour(hour);
          }}
          onPointerLeave={() => setHoverHour(null)}
        >
          {overlays.map((overlay) => (
            <div
              key={overlay.key}
              className="pointer-events-none absolute bottom-0"
              style={{
                left: `${(overlay.lo / 24) * 100}%`,
                width: `${Math.max(0.4, ((overlay.hi - overlay.lo) / 24) * 100)}%`,
                top: `${overlayTop}%`,
                background: overlay.color,
              }}
            />
          ))}
          {hasOverlays
            ? overlays.map((overlay) => (
                <span
                  key={`label-${overlay.key}`}
                  className="pointer-events-none absolute truncate font-caption text-caption leading-none text-text-secondary"
                  style={{
                    left: `${((overlay.lo + overlay.hi) / 2 / 24) * 100}%`,
                    top: "0%",
                    maxWidth: `${Math.max(8, ((overlay.hi - overlay.lo) / 24) * 100)}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {overlay.label}
                </span>
              ))
            : null}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          >
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
            {points.map((point) => {
              const slot = 100 / 24;
              const gap = 0.35;
              const x = point.hour * slot + gap / 2;
              const width = Math.max(0.4, slot - gap);
              const nodes = [];
              if (showBand && point.min != null && point.max != null) {
                const top = yAt(point.max);
                nodes.push(
                  <rect
                    key={`band-${point.hour}`}
                    x={x}
                    y={top}
                    width={width}
                    height={Math.max(0.4, yAt(point.min) - top)}
                    fill="currentColor"
                    fillOpacity="0.18"
                  />,
                );
              }
              if (point.value != null && point.value > 0 && !showBand) {
                const top = yAt(point.value);
                nodes.push(
                  <rect
                    key={point.hour}
                    x={x}
                    y={top}
                    width={width}
                    height={Math.max(0.4, 100 - top)}
                    fill="currentColor"
                    fillOpacity={hoverHour === point.hour ? 1 : 0.92}
                    rx="0.4"
                  />,
                );
              }
              if (showBand && point.value != null) {
                const y = yAt(point.value);
                nodes.push(
                  <line
                    key={`avg-${point.hour}`}
                    x1={x}
                    x2={x + width}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />,
                );
              }
              return nodes.length > 0 ? <g key={point.hour}>{nodes}</g> : null;
            })}
          </svg>
          {showHover && hoverHour != null && hoverAnchor != null ? (
            <span
              className="pointer-events-none absolute z-10 flex justify-center"
              style={{
                left: `${(hoverHour / 24) * 100}%`,
                width: `${100 / 24}%`,
                top: `${yAt(hoverAnchor)}%`,
                transform: "translateY(calc(-100% - 4px))",
              }}
            >
              <span className="rounded-lg border border-primary/30 bg-primary-fixed px-sm py-xs text-left font-caption text-caption leading-tight tabular-nums text-text-primary">
                {hoverText && hoverText.length > 0 ? (
                  <span className="flex flex-col">
                    {hoverText.map((line) => (
                      <span key={line} className="whitespace-nowrap">
                        {line}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="whitespace-nowrap leading-none">
                    {hoverLabel(hoverValue as number)}
                  </span>
                )}
              </span>
            </span>
          ) : null}
        </div>
        <div className="relative h-4">
          {X_TICKS.map((hour) => (
            <span
              key={hour}
              className={`absolute top-0 whitespace-nowrap ${AXIS_CLASS}`}
              style={{
                left: `${(hour / 24) * 100}%`,
                transform:
                  hour <= 0 ? "none" : hour >= 24 ? "translateX(-100%)" : "translateX(-50%)",
              }}
            >
              {hour}时
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function hourOfDay(iso: string, timeZone: string): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour + minute / 60;
}
