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

type HealthSparklineProps = {
  points: HealthSeriesPoint[];
  className?: string;
};

export function HealthSparkline({ points, className }: HealthSparklineProps) {
  const valued = points.filter((point): point is HealthSeriesPoint & { value: number } => point.value != null);
  if (valued.length === 0) {
    return (
      <p className="flex h-full min-h-[4.5rem] w-full items-center justify-end text-caption text-neutral-muted">
        暂无趋势
      </p>
    );
  }
  const values = valued.map((point) => point.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin = Math.min(0, dataMin);
  const yMax = Math.max(0, dataMax);
  const span = yMax - yMin || 1;
  const latest = valued[valued.length - 1];
  const padL = 28;
  const padR = 2;
  const padT = 6;
  const padB = 12;
  const width = 168;
  const height = 76;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xAt = (index: number, count: number) =>
    padL + (count <= 1 ? plotW / 2 : (index / (count - 1)) * plotW);
  const yAt = (value: number) => padT + (1 - (value - yMin) / span) * plotH;
  const d = valued
    .map((point, index) => {
      const x = xAt(index, valued.length);
      const y = yAt(point.value);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const near = (a: number, b: number) => Math.abs(a - b) / span < 0.12;
  const yTicks = [
    { value: dataMax, label: formatAxisNumber(dataMax) },
    { value: 0, label: "0" },
    { value: dataMin, label: formatAxisNumber(dataMin) },
  ].filter((tick, index, all) => all.findIndex((item) => near(item.value, tick.value)) === index);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className ?? "h-full w-full text-primary"}
      aria-hidden
    >
      <line
        x1={padL}
        y1={padT}
        x2={padL}
        y2={padT + plotH}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      <line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      <line
        x1={padL}
        y1={yAt(0)}
        x2={padL + plotW}
        y2={yAt(0)}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      {yTicks.map((tick) => (
        <g key={`${tick.value}-${tick.label}`}>
          <line
            x1={padL - 3}
            y1={yAt(tick.value)}
            x2={padL}
            y2={yAt(tick.value)}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
          <text
            x={padL - 5}
            y={yAt(tick.value)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-neutral-muted"
            fontSize="8"
          >
            {tick.label}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text x={padL + plotW} y={height - 1} textAnchor="end" className="fill-neutral-muted" fontSize="8">
        {formatAxisDate(latest.local_date)}
      </text>
    </svg>
  );
}
