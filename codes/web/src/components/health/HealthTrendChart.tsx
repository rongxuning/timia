import {
  scoreBandsForScale,
  SCORE_BAND_FILL,
  type ScoreScale,
} from "@/components/health/healthScoreBands";
import type { HealthSeriesPoint } from "@/types/api/views/health";

function formatAxisNumber(n: number): string {
  if (Math.abs(n) >= 100) return String(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 10) return (Math.round(n * 10) / 10).toFixed(1);
  return String(Math.round(n * 100) / 100);
}

function formatAxisDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function addDays(iso: string, days: number): string {
  const parts = iso.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2] + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateMs(iso: string): number {
  const parts = iso.split("-").map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

function rangeTickDays(rangeDays: number): number[] {
  if (rangeDays === 7) return [1, 3, 5, 7];
  if (rangeDays === 30) return [1, 10, 20, 30];
  if (rangeDays === 90) return [1, 30, 60, 90];
  return [1, rangeDays];
}

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
  dayXLabels?: [string, string] | null;
};

export function HealthTrendChart({
  points,
  scale,
  className,
  rangeDays,
  rangeEnd,
  dayXLabels,
}: HealthTrendChartProps) {
  const valued = points.filter((point): point is HealthSeriesPoint & { value: number } => point.value != null);
  if (valued.length === 0) {
    return (
      <p className="flex h-full min-h-[12rem] w-full items-center justify-end text-caption text-neutral-muted">
        暂无趋势
      </p>
    );
  }
  const values = valued.map((point) => point.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin = Math.min(0, dataMin);
  const padTop = Math.max(0, dataMin);
  const yMax = Math.max(dataMax + padTop, yMin + 1);
  const span = yMax - yMin || 1;
  const yAt = (value: number) => (1 - (value - yMin) / span) * 100;
  const calendarEnd = rangeEnd ?? valued[valued.length - 1].local_date;
  const calendarStart = rangeDays ? addDays(calendarEnd, -(rangeDays - 1)) : null;
  const xAt = (index: number, iso: string) => {
    if (calendarStart && rangeDays && rangeDays > 1) {
      const t0 = dateMs(calendarStart);
      const t1 = dateMs(calendarEnd);
      if (t1 === t0) return 50;
      return ((dateMs(iso) - t0) / (t1 - t0)) * 100;
    }
    return valued.length <= 1 ? 50 : (index / (valued.length - 1)) * 100;
  };
  const d = valued
    .map((point, index) => {
      const x = xAt(index, point.local_date);
      const y = yAt(point.value);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const near = (a: number, b: number) => Math.abs(a - b) / span < 0.08;
  const yTicks = [
    { value: dataMax, label: formatAxisNumber(dataMax) },
    { value: 0, label: "0" },
    { value: dataMin, label: formatAxisNumber(dataMin) },
  ].filter((tick, index, all) => all.findIndex((item) => near(item.value, tick.value)) === index);
  const bands = [
    ...scoreBandsForScale(scale, yMin, dataMax),
    ...(yMax > dataMax ? [{ y0: dataMax, y1: yMax, tone: "high" as const }] : []),
  ];
  const zeroInside = yMin < 0 && yMax > 0;
  const xTicks = buildXTicks({
    valued,
    rangeDays,
    calendarStart,
    calendarEnd,
    dayXLabels,
  });

  return (
    <div className={className ?? "flex h-48 w-full text-primary"}>
      <div className="flex w-auto min-w-[2rem] shrink-0 flex-col pb-4 pr-sm">
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
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="min-h-0 w-full flex-1"
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
        <div className="relative h-4">
          {xTicks.map((tick) => (
            <span
              key={`${tick.at}-${tick.label}`}
              className="absolute top-0 font-caption text-caption leading-none text-neutral-muted"
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

function buildXTicks({
  valued,
  rangeDays,
  calendarStart,
  calendarEnd,
  dayXLabels,
}: {
  valued: Array<HealthSeriesPoint & { value: number }>;
  rangeDays?: number | null;
  calendarStart: string | null;
  calendarEnd: string;
  dayXLabels?: [string, string] | null;
}): TrendXLabel[] {
  if (dayXLabels) {
    return [
      { at: 0, label: dayXLabels[0] },
      { at: 100, label: dayXLabels[1] },
    ];
  }
  if (rangeDays && calendarStart && rangeDays > 1) {
    return rangeTickDays(rangeDays).map((day) => ({
      at: ((day - 1) / (rangeDays - 1)) * 100,
      label: formatAxisDate(addDays(calendarStart, day - 1)),
    }));
  }
  const first = valued[0].local_date;
  const last = valued[valued.length - 1].local_date;
  if (first === last) return [{ at: 100, label: formatAxisDate(last) }];
  return [
    { at: 0, label: formatAxisDate(first) },
    { at: 100, label: formatAxisDate(last) },
  ];
}
