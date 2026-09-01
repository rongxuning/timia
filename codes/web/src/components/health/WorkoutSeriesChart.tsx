"use client";

import type { HealthWorkoutDetail } from "@/types/api/views/health";

type SeriesWindow = NonNullable<HealthWorkoutDetail["heart_rate"]>;

type WorkoutSeriesChartProps = {
  title: string;
  series: SeriesWindow | null | undefined;
  formatValue: (value: number) => string;
  invertY?: boolean;
  maxLabel?: string;
  extras?: Array<string | null | undefined>;
  showEmpty?: boolean;
};

function formatMmSs(offsetSeconds: number): string {
  const total = Math.max(0, Math.round(offsetSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function yAtValue(value: number, yMin: number, span: number, invertY: boolean): number {
  const t = (value - yMin) / span;
  return (invertY ? t : 1 - t) * 100;
}

export function WorkoutSeriesChart({
  title,
  series,
  formatValue,
  invertY = false,
  maxLabel = "最大",
  extras,
  showEmpty = false,
}: WorkoutSeriesChartProps) {
  const points = series?.points ?? [];
  if (points.length === 0) {
    if (!showEmpty) return null;
    return (
      <section>
        <h3 className="text-small font-medium text-text-primary">{title}</h3>
        <div className="mt-sm rounded-xl border border-border-subtle bg-white p-md">
          <p className="text-small text-text-secondary">暂无数据</p>
        </div>
      </section>
    );
  }

  const values = points.map((point) => point.value);
  const offsets = points.map((point) => point.offset_seconds);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const rawSpan = dataMax - dataMin || 1;
  const pad = rawSpan * 0.08;
  const yMin = dataMin - pad;
  const yMax = dataMax + pad;
  const span = yMax - yMin || 1;
  const t0 = Math.min(...offsets);
  const t1 = Math.max(...offsets);
  const xAt = (offset: number) => (t1 === t0 ? 50 : ((offset - t0) / (t1 - t0)) * 100);
  const yAt = (value: number) => yAtValue(value, yMin, span, invertY);
  const d = points
    .map((point, index) => {
      const x = xAt(point.offset_seconds);
      const y = yAt(point.value);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const near = (a: number, b: number) => Math.abs(a - b) / rawSpan < 0.08;
  const yTicks = [
    { value: invertY ? dataMin : dataMax, label: formatValue(invertY ? dataMin : dataMax) },
    { value: invertY ? dataMax : dataMin, label: formatValue(invertY ? dataMax : dataMin) },
  ].filter((tick, index, all) => all.findIndex((item) => near(item.value, tick.value)) === index);
  const xTicks = [
    { at: xAt(t0), label: formatMmSs(t0) },
    ...(t1 - t0 > 20 * 60
      ? [{ at: xAt((t0 + t1) / 2), label: formatMmSs((t0 + t1) / 2) }]
      : []),
    ...(t1 !== t0 ? [{ at: xAt(t1), label: formatMmSs(t1) }] : []),
  ];

  const avg = series?.avg;
  const peak = invertY ? dataMin : (series?.max ?? dataMax);
  const extraBits = (extras ?? []).filter((item): item is string => Boolean(item));

  return (
    <section>
      <div className="flex flex-wrap items-baseline gap-x-md gap-y-1">
        <h3 className="text-small font-medium text-text-primary">{title}</h3>
        <p className="text-caption tabular-nums text-text-secondary">
          {avg != null ? <span>平均 {formatValue(avg)}</span> : null}
          {avg != null && peak != null ? <span className="mx-1.5 text-neutral-muted">·</span> : null}
          {peak != null ? (
            <span>
              {maxLabel} {formatValue(peak)}
            </span>
          ) : null}
          {extraBits.map((item) => (
            <span key={item}>
              <span className="mx-1.5 text-neutral-muted">·</span>
              {item}
            </span>
          ))}
        </p>
      </div>
      <div className="mt-sm rounded-xl border border-border-subtle bg-white p-md">
        <div className="flex h-48 w-full text-primary" role="img" aria-label={`${title}曲线`}>
          <div className="flex w-auto min-w-[2.75rem] shrink-0 flex-col pb-4 pr-sm">
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
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="min-h-0 w-full flex-1" aria-hidden>
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
              <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {points.length === 1 ? (
                <line
                  x1={Math.max(0, xAt(points[0].offset_seconds) - 1.5)}
                  y1={yAt(points[0].value)}
                  x2={Math.min(100, xAt(points[0].offset_seconds) + 1.5)}
                  y2={yAt(points[0].value)}
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>
            <div className="relative h-4">
              {xTicks.map((tick) => (
                <span
                  key={`${tick.at}-${tick.label}`}
                  className="absolute top-0 font-caption text-caption leading-none text-neutral-muted tabular-nums"
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
      </div>
    </section>
  );
}

export function formatPaceTick(secPerKm: number): string {
  const total = Math.max(0, Math.round(secPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}'${String(seconds).padStart(2, "0")}"`;
}

export function formatIntTick(value: number): string {
  return String(Math.round(value));
}

export function formatStrideTick(value: number): string {
  return value.toFixed(2);
}
