"use client";

import { HealthEmptyHint } from "@/components/health/HealthChartFrame";

type HealthHeartbeatBarsProps = {
  intervalsMs: number[];
};

export function HealthHeartbeatBars({ intervalsMs }: HealthHeartbeatBarsProps) {
  if (intervalsMs.length === 0) {
    return <HealthEmptyHint text="当天还没有 tachogram。" />;
  }
  const min = Math.min(...intervalsMs);
  const max = Math.max(...intervalsMs);
  const span = max - min || 1;
  const buckets = Array.from({ length: 12 }, () => 0);
  for (const value of intervalsMs) {
    const index = Math.min(11, Math.floor(((value - min) / span) * 12));
    buckets[index] += 1;
  }
  const peak = Math.max(...buckets, 1);
  const padL = 8;
  const padR = 8;
  const padT = 6;
  const padB = 14;
  const width = 576;
  const height = 88;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const barW = plotW / buckets.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-28 w-full text-primary" role="img">
      {buckets.map((count, index) => {
        const h = (count / peak) * plotH;
        return (
          <rect
            key={index}
            x={padL + index * barW + 1}
            y={padT + plotH - h}
            width={Math.max(1, barW - 2)}
            height={Math.max(1, h)}
            fill="currentColor"
            rx="1"
          />
        );
      })}
      <text x={padL} y={height - 2} className="fill-neutral-muted" fontSize="8">
        {Math.round(min)} ms
      </text>
      <text x={padL + plotW} y={height - 2} textAnchor="end" className="fill-neutral-muted" fontSize="8">
        {Math.round(max)} ms
      </text>
    </svg>
  );
}
