"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CHART_HEIGHT,
  CHART_WIDTH,
  formatChartDate,
  lineChartLayout,
  nearestChartIndex,
  type ChartPoint,
  type DatedBalance,
} from "@/components/assets/assetChartRange";

const SERIES = [
  { key: "net_worth_minor", label: "summary.netWorth", tone: "text-primary" },
  { key: "assets_minor", label: "summary.assets", tone: "text-success" },
  { key: "liabilities_minor", label: "summary.liabilities", tone: "text-error" },
] as const;

type AssetBalanceChartsProps = {
  series: DatedBalance[];
  locale: string;
  formatMoney: (amountMinor: number) => string;
};

export function AssetBalanceCharts({ series, locale, formatMoney }: AssetBalanceChartsProps) {
  const t = useTranslations("assets");
  const rangeLabel =
    series.length === 0
      ? null
      : t("calendar.range", {
          start: formatChartDate(series[0].as_of, locale),
          end: formatChartDate(series[series.length - 1].as_of, locale),
        });

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-body font-medium text-text-primary">{t("charts.title")}</h2>
        {rangeLabel ? <p className="text-caption text-text-secondary">{rangeLabel}</p> : null}
      </div>
      {series.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-white px-lg py-md text-small text-text-secondary">
          {t("charts.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          {SERIES.map((item) => (
            <BalanceChart
              key={item.key}
              title={t(item.label)}
              tone={item.tone}
              points={series.map((point) => ({ as_of: point.as_of, value: point[item.key] }))}
              locale={locale}
              formatMoney={formatMoney}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BalanceChart({
  title,
  tone,
  points,
  locale,
  formatMoney,
}: {
  title: string;
  tone: string;
  points: ChartPoint[];
  locale: string;
  formatMoney: (amountMinor: number) => string;
}) {
  const layout = useMemo(() => lineChartLayout(points), [points]);
  const [hover, setHover] = useState<number | null>(null);
  if (!layout) return null;
  const { coords } = layout;
  const index = Math.min(hover ?? coords.length - 1, coords.length - 1);
  const active = coords[index];
  const first = coords[0];
  const last = coords[coords.length - 1];

  function moveTo(clientX: number, width: number) {
    const x = (clientX / width) * CHART_WIDTH;
    setHover(nearestChartIndex(coords, x));
  }

  return (
    <article className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-small font-medium text-text-primary">{title}</h3>
        <p className="text-body tabular-nums text-text-primary">{formatMoney(active.value)}</p>
      </div>
      <p className="text-caption text-text-secondary">{formatChartDate(active.as_of, locale)}</p>
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className={`mt-2 h-36 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/40 ${tone}`}
        aria-label={`${title} ${formatChartDate(first.as_of, locale)} ${formatMoney(first.value)} ${formatChartDate(last.as_of, locale)} ${formatMoney(last.value)}`}
        tabIndex={0}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          moveTo(event.clientX - rect.left, rect.width);
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const current = hover ?? coords.length - 1;
          const next = event.key === "ArrowLeft" ? Math.max(0, current - 1) : Math.min(coords.length - 1, current + 1);
          setHover(next);
        }}
      >
        {layout.area ? <path d={layout.area} className="fill-current opacity-10" /> : null}
        {layout.line ? (
          <path
            d={layout.line}
            fill="none"
            className="stroke-current"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        <line
          x1={active.x}
          x2={active.x}
          y1={12}
          y2={layout.baseline}
          className="stroke-current opacity-30"
          strokeWidth="1"
        />
        <circle cx={active.x} cy={active.y} r="4" className="fill-current" />
      </svg>
      {first.as_of === last.as_of ? (
        <p className="text-caption text-neutral-muted">{formatChartDate(first.as_of, locale)}</p>
      ) : (
        <div className="flex justify-between text-caption text-neutral-muted">
          <span>{formatChartDate(first.as_of, locale)}</span>
          <span>{formatChartDate(last.as_of, locale)}</span>
        </div>
      )}
    </article>
  );
}
