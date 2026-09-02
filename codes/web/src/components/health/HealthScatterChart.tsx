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

export function HealthScatterChart({ points, format }: HealthScatterChartProps) {
  if (points.length === 0) {
    return <HealthEmptyHint text="这段时间还没有测量点。" />;
  }
  const times = points.map((point) => new Date(point.at).getTime());
  const values = points.map((point) => point.value);
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const spanT = Math.max(1, t1 - t0);
  const yMin = Math.min(...values, 0);
  const yMax = Math.max(...values);
  const spanY = yMax - yMin || 1;
  const padL = 32;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const width = 576;
  const height = 96;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xAt = (at: string) => padL + ((new Date(at).getTime() - t0) / spanT) * plotW;
  const yAt = (value: number) => padT + (1 - (value - yMin) / spanY) * plotH;
  const label = format ?? ((value: number) => String(Math.round(value * 10) / 10));
  const line = points
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(point.at).toFixed(1)},${yAt(point.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-36 w-full text-primary" role="img">
      <line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke="currentColor"
        strokeOpacity="0.28"
      />
      <text x={padL - 4} y={padT + 4} textAnchor="end" className="fill-neutral-muted" fontSize="8">
        {label(yMax)}
      </text>
      {points.length > 1 ? (
        <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.45" />
      ) : null}
      {points.map((point, index) => (
        <circle
          key={`${point.at}-${point.value}-${index}`}
          cx={xAt(point.at)}
          cy={yAt(point.value)}
          r="2.4"
          fill={point.window === "night" ? "#1e3a8a" : "currentColor"}
        />
      ))}
      <text x={padL} y={height - 2} className="fill-neutral-muted" fontSize="8">
        {formatAxis(points[0].at)}
      </text>
      <text x={padL + plotW} y={height - 2} textAnchor="end" className="fill-neutral-muted" fontSize="8">
        {formatAxis(points[points.length - 1].at)}
      </text>
    </svg>
  );
}

function formatAxis(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
