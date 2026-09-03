"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatHealthTrendY, HEALTH_CARD_LABELS, HEALTH_CARD_SERIES, type HealthCardKey } from "@/components/health/healthCards";
import { SCORE_BAND_LEGEND, SCORE_BAND_ROW_CLASS, scoreScaleForMetric } from "@/components/health/healthScoreBands";
import { HealthTrendChart } from "@/components/health/HealthTrendChart";
import type { HealthEnergyTargets, HealthSeriesPoint } from "@/types/api/views/health";

type HealthMetricDetailShellProps = {
  metric: HealthCardKey;
  backHref: string;
  valueLabel: string;
  totalLabel?: string | null;
  score: number | null | undefined;
  formula?: string;
  hint?: string;
  series: HealthSeriesPoint[];
  energyTargets?: HealthEnergyTargets | null;
  heightCm?: number | null;
  rangeDays?: number | null;
  rangeEnd?: string | null;
  anchorValue?: number | null;
  hours?: Array<{ hour: number; value?: number | null }> | null;
  children?: ReactNode;
};

export function HealthMetricDetailShell({
  metric,
  backHref,
  valueLabel,
  totalLabel,
  score,
  formula,
  hint,
  series,
  energyTargets,
  heightCm,
  rangeDays,
  rangeEnd,
  anchorValue,
  hours,
  children,
}: HealthMetricDetailShellProps) {
  const title = HEALTH_CARD_LABELS[metric];
  const scoreText = score == null ? "none" : String(score);
  const scale = scoreScaleForMetric(metric, energyTargets, heightCm);
  const showFormula = Boolean(formula && formula !== "none");
  const showTotal = Boolean(totalLabel && totalLabel !== "—");
  const formulaLines = showFormula
    ? (formula ?? "").split(/；|;/).map((line) => line.trim()).filter(Boolean)
    : [];

  return (
    <section className="rounded-xl border border-border-subtle bg-white p-lg">
      <Link href={backHref} className="text-caption text-primary hover:underline">
        返回健康
      </Link>
      <div className="mt-md grid grid-cols-1 items-stretch gap-md sm:grid-cols-[minmax(0,1fr)_minmax(14rem,1.35fr)]">
        <div className="flex h-full flex-col justify-start gap-sm">
          <div className="flex flex-wrap items-baseline gap-sm leading-tight">
            <h2 className="font-headline text-subhead font-bold leading-tight text-text-primary">{title}</h2>
            <span className="text-caption text-text-secondary">评分 {scoreText}</span>
          </div>
          <p className="font-headline text-lg font-bold leading-tight text-text-primary">
            {showTotal ? `日均 ${valueLabel}` : valueLabel}
          </p>
          {showTotal ? (
            <p className="text-caption leading-tight text-text-secondary">{totalLabel}</p>
          ) : null}
        </div>
        {showFormula ? (
          <div className="flex rounded-lg bg-primary-fixed px-md py-sm text-caption text-text-secondary">
            <div className="flex flex-col justify-center">
              {hint ? <p>{hint}</p> : null}
              {formulaLines.map((line, index) => (
                <p key={line} className={hint || index > 0 ? "mt-1" : undefined}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <p className="self-center text-caption text-neutral-muted">{hint ?? "该指标的详情与分析"}</p>
        )}
      </div>
      <div className="mt-lg h-48 min-h-[12rem]">
        <HealthTrendChart
          points={series}
          scale={scale}
          className="flex h-full w-full text-primary"
          rangeDays={rangeDays}
          rangeEnd={rangeEnd}
          hours={hours}
          formatY={(value) => formatHealthTrendY(metric, value)}
          anchor={rangeEnd ? { local_date: rangeEnd, value: anchorValue } : null}
          yPad={metric === "vo2" || metric === "recovery" || metric === "weight" ? 3 : 0}
        />
      </div>
      {scale.kind !== "none" ? (
        <p className="mt-sm flex flex-wrap gap-x-sm gap-y-1 text-caption tabular-nums text-text-secondary">
          {SCORE_BAND_LEGEND.map((item) => (
            <span
              key={item.tone}
              className={`rounded-md px-sm py-0.5 ${SCORE_BAND_ROW_CLASS[item.tone]}`}
            >
              {item.label}：{item.range}
            </span>
          ))}
        </p>
      ) : null}
      {children ? <div className="mt-lg">{children}</div> : null}
      <div className="mt-lg rounded-xl border border-dashed border-border-subtle p-lg">
        <h3 className="text-small font-medium text-text-primary">分析与建议</h3>
        <p className="mt-2 text-small text-text-secondary">
          将根据该指标的原始数据与日汇总，由平台大模型生成观察与建议。图表与结构已按样本计算，文案稍后接入。
        </p>
      </div>
    </section>
  );
}

export function healthCardSeriesKey(metric: HealthCardKey): string {
  return HEALTH_CARD_SERIES[metric];
}
