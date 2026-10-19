"use client";

import { useTranslations } from "next-intl";
import type { DailyBalancePoint } from "@/types/api/views/assets";

type AssetsTrendChartProps = {
  points: DailyBalancePoint[];
  formatMoney: (amountMinor: number) => string;
};

export function hasDailyMovement(points: DailyBalancePoint[]): boolean {
  return points.some(
    (point) => point.assets_minor !== 0 || point.liabilities_minor !== 0 || point.net_worth_minor !== 0,
  );
}

export function AssetsTrendChart({ points, formatMoney }: AssetsTrendChartProps) {
  const t = useTranslations("assets");
  if (!hasDailyMovement(points)) return null;
  const width = 640;
  const height = 240;
  const pad = { top: 16, right: 16, bottom: 28, left: 8 };
  const values = points.flatMap((point) => [
    point.assets_minor,
    point.liabilities_minor,
    point.net_worth_minor,
  ]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const xAt = (index: number) => pad.left + (points.length === 1 ? innerW / 2 : (index / (points.length - 1)) * innerW);
  const yAt = (value: number) => pad.top + ((max - value) / span) * innerH;
  const pathFor = (pick: (point: DailyBalancePoint) => number) =>
    points
      .map((point, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(pick(point)).toFixed(1)}`)
      .join(" ");
  const ticks = [0, Math.floor(points.length / 2), points.length - 1].filter(
    (value, index, all) => all.indexOf(value) === index,
  );

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-60 w-full" role="img" aria-label={t("chart.aria")}>
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={yAt(0)}
          y2={yAt(0)}
          className="stroke-border-subtle"
          strokeWidth="1"
        />
        <path d={pathFor((point) => point.assets_minor)} fill="none" className="stroke-success" strokeWidth="2" />
        <path d={pathFor((point) => point.liabilities_minor)} fill="none" className="stroke-error" strokeWidth="2" />
        <path d={pathFor((point) => point.net_worth_minor)} fill="none" className="stroke-primary" strokeWidth="2.5" />
        {ticks.map((index) => (
          <text
            key={points[index]?.as_of ?? index}
            x={xAt(index)}
            y={height - 8}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            className="fill-neutral-muted text-[11px]"
          >
            {shortDate(points[index]?.as_of ?? "")}
          </text>
        ))}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-4 text-caption text-text-secondary">
        <li className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-primary" />
          {t("chart.netWorth")} {formatMoney(points[points.length - 1]?.net_worth_minor ?? 0)}
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-success" />
          {t("chart.assets")} {formatMoney(points[points.length - 1]?.assets_minor ?? 0)}
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-error" />
          {t("chart.liabilities")} {formatMoney(points[points.length - 1]?.liabilities_minor ?? 0)}
        </li>
      </ul>
    </div>
  );
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  if (!month || !day) return iso;
  return `${Number(month)}/${Number(day)}`;
}

export function sliceDailySeries(series: DailyBalancePoint[], start: string, end: string): DailyBalancePoint[] {
  const ordered = [...series].sort((a, b) => a.as_of.localeCompare(b.as_of));
  const points: DailyBalancePoint[] = [];
  let carried: DailyBalancePoint | null = null;
  let cursor = 0;
  for (let day = start; day <= end; day = shiftIso(day, 1)) {
    while (cursor < ordered.length && ordered[cursor].as_of <= day) {
      carried = ordered[cursor];
      cursor += 1;
    }
    points.push({
      as_of: day,
      assets_minor: carried && carried.as_of <= day ? carried.assets_minor : 0,
      liabilities_minor: carried && carried.as_of <= day ? carried.liabilities_minor : 0,
      net_worth_minor: carried && carried.as_of <= day ? carried.net_worth_minor : 0,
    });
    if (day === end) break;
  }
  return points;
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, (day || 1) + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
