"use client";

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
  showBand?: boolean;
  workouts?: HealthHourlyWorkout[];
  timezone?: string;
};

export function HealthHourlyBars({
  points,
  format,
  showBand,
  workouts,
  timezone = "Asia/Shanghai",
}: HealthHourlyBarsProps) {
  const valued = points.filter((point) => point.value != null);
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
  const padL = 36;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const width = 576;
  const height = 112;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const barW = plotW / 24;
  const yAt = (value: number) => padT + (1 - value / yMax) * plotH;
  const label = format ?? ((value: number) => String(Math.round(value)));
  const overlays = (workouts ?? []).flatMap((workout) => {
    const start = hourOfDay(workout.start_at, timezone);
    let end = hourOfDay(workout.end_at, timezone);
    if (end <= start) end += 24;
    const color = workoutActivityStyle(workout.activity_type, workout.activity_type_raw).band;
    const ranges = end <= 24 ? [[start, end]] : [[start, 24], [0, end - 24]];
    return ranges
      .map(([lo, hi]) => ({
        lo: Math.max(0, lo),
        hi: Math.min(24, hi),
        color,
      }))
      .filter((item) => item.hi > item.lo);
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-36 w-full text-primary"
      role="img"
    >
      {overlays.map((overlay, index) => (
        <rect
          key={`${overlay.lo}-${overlay.hi}-${index}`}
          x={padL + (overlay.lo / 24) * plotW}
          y={padT}
          width={Math.max(2, ((overlay.hi - overlay.lo) / 24) * plotW)}
          height={plotH}
          fill={overlay.color}
        />
      ))}
      <line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      <text x={padL - 4} y={padT + 4} textAnchor="end" className="fill-neutral-muted" fontSize="10">
        {label(yMax)}
      </text>
      {points.map((point) => {
        const x = padL + point.hour * barW;
        const nodes = [];
        if (showBand && point.min != null && point.max != null) {
          const top = yAt(point.max);
          const bottom = yAt(point.min);
          nodes.push(
            <rect
              key={`band-${point.hour}`}
              x={x + 1}
              y={top}
              width={Math.max(1, barW - 2)}
              height={Math.max(1, bottom - top)}
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
              x={x + 1}
              y={top}
              width={Math.max(1, barW - 2)}
              height={Math.max(1, padT + plotH - top)}
              fill="currentColor"
              rx="1"
            />,
          );
        }
        if (showBand && point.value != null) {
          const y = yAt(point.value);
          nodes.push(
            <line
              key={`avg-${point.hour}`}
              x1={x + 1}
              x2={x + barW - 1}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth="1.5"
            />,
          );
        }
        return nodes.length > 0 ? <g key={point.hour}>{nodes}</g> : null;
      })}
      {[0, 6, 12, 18, 24].map((hour) => (
        <text
          key={hour}
          x={padL + Math.min(hour, 23.999) * barW + (hour === 24 ? 0 : barW / 2)}
          y={height - 2}
          textAnchor={hour === 0 ? "start" : hour === 24 ? "end" : "middle"}
          className="fill-neutral-muted"
          fontSize="10"
        >
          {hour}
        </text>
      ))}
    </svg>
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
