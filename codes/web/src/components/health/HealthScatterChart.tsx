"use client";

import { HealthEmptyHint } from "@/components/health/HealthChartFrame";

export type HealthScatterPoint = {
  at: string;
  value: number;
  window?: string | null;
};

type HealthScatterChartProps = {
  points: HealthScatterPoint[];
  format?: (value: number) => string;
};

const AXIS_TICK = "font-caption text-caption leading-none text-neutral-muted tabular-nums";

export function HealthScatterChart({ points, format }: HealthScatterChartProps) {
  if (points.length === 0) {
    return <HealthEmptyHint text="这段时间还没有测量点。" />;
  }
  const ordered = points
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const times = ordered.map((point) => new Date(point.at).getTime());
  const values = ordered.map((point) => point.value);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const spanT = Math.max(1, t1 - t0);
  const yMin = Math.min(...values, 0);
  const yMax = Math.max(...values);
  const spanY = yMax - yMin || 1;
  const padL = 0;
  const padR = 0;
  const padT = 8;
  const padB = 0;
  const width = 576;
  const height = 96;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xAt = (at: string) => padL + ((new Date(at).getTime() - t0) / spanT) * plotW;
  const yAt = (value: number) => padT + (1 - (value - yMin) / spanY) * plotH;
  const label = format ?? ((value: number) => String(Math.round(value * 10) / 10));
  const line = ordered
    .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(point.at).toFixed(1)},${yAt(point.value).toFixed(1)}`)
    .join(" ");

  return (
    <div className="flex h-36 w-full text-primary" role="img">
      <div className="flex w-auto min-w-[2rem] shrink-0 flex-col pb-4 pr-sm">
        <div className="relative min-h-0 flex-1">
          <span className={`absolute left-0 top-0 ${AXIS_TICK}`}>{label(yMax)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="min-h-0 w-full flex-1"
          aria-hidden
        >
          <line
            x1={padL}
            y1={padT + plotH}
            x2={padL + plotW}
            y2={padT + plotH}
            stroke="currentColor"
            strokeOpacity="0.28"
          />
          {ordered.length > 1 ? (
            <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.45" />
          ) : null}
          {ordered.map((point, index) => (
            <circle
              key={`${point.at}-${point.value}-${index}`}
              cx={xAt(point.at)}
              cy={yAt(point.value)}
              r="2.4"
              fill={point.window === "night" ? "#1e3a8a" : "currentColor"}
            />
          ))}
        </svg>
        <div className="relative h-4">
          <span className={`absolute left-0 top-0 whitespace-nowrap ${AXIS_TICK}`}>
            {formatAxis(ordered[0].at)}
          </span>
          {ordered.length > 1 ? (
            <span className={`absolute right-0 top-0 whitespace-nowrap ${AXIS_TICK}`}>
              {formatAxis(ordered[ordered.length - 1].at)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function formatAxis(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
