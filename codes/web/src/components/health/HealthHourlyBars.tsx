"use client";

import { HealthEmptyHint } from "@/components/health/HealthChartFrame";

export type HealthHourPoint = {
  hour: number;
  value?: number | null;
  min?: number | null;
  max?: number | null;
};

type HealthHourlyBarsProps = {
  points: HealthHourPoint[];
  format?: (value: number) => string;
  showBand?: boolean;
};

export function HealthHourlyBars({ points, format, showBand }: HealthHourlyBarsProps) {
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
  const padL = 28;
  const padR = 6;
  const padT = 8;
  const padB = 16;
  const width = 288;
  const height = 96;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const barW = plotW / 24;
  const yAt = (value: number) => padT + (1 - value / yMax) * plotH;
  const label = format ?? ((value: number) => String(Math.round(value)));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-full text-primary" role="img">
      <line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      <text x={padL - 4} y={padT + 4} textAnchor="end" className="fill-neutral-muted" fontSize="8">
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
      {[0, 6, 12, 18].map((hour) => (
        <text
          key={hour}
          x={padL + hour * barW + barW / 2}
          y={height - 2}
          textAnchor="middle"
          className="fill-neutral-muted"
          fontSize="8"
        >
          {hour}
        </text>
      ))}
    </svg>
  );
}
