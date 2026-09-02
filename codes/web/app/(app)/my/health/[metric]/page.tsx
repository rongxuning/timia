"use client";

import { Suspense, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { HealthMetricDetail } from "@/components/health/HealthMetricDetail";
import { HealthMetricDetailShell, healthCardSeriesKey } from "@/components/health/HealthMetricDetailShell";
import { HealthPageFrame } from "@/components/health/HealthPageFrame";
import { hoursForHealthTrend, isHealthCardKey, valuedHours } from "@/components/health/healthCards";
import { cardsFromCurrent } from "@/components/health/MyHealthCards";
import { PageMain } from "@/components/layout";
import { useHealthCardDetail } from "@/hooks/useHealthCardDetail";
import { useMyHealthPage } from "@/hooks/useMyHealthPage";

function HealthMetricPageFallback() {
  return (
    <PageMain className="!px-3" fullWidth>
      <p className="text-small text-text-secondary">加载中…</p>
    </PageMain>
  );
}

function HealthMetricPageInner() {
  const router = useRouter();
  const params = useParams<{ metric: string }>();
  const page = useMyHealthPage();
  const metric = params.metric;
  const validMetric = isHealthCardKey(metric);
  const cardDetail = useHealthCardDetail(validMetric ? page.token : null, metric, {
    date: page.selectedDate,
    range: page.rangeDays,
  });

  useEffect(() => {
    if (!isHealthCardKey(metric)) {
      router.replace(`/my/health${page.queryString}`);
    }
  }, [metric, page.queryString, router]);

  if (!isHealthCardKey(metric)) return null;

  const card = cardsFromCurrent(page.view?.current, page.view?.totals, page.loading, page.rangeMode).find(
    (item) => item.key === metric,
  );
  const formula = page.view?.score_formulas?.[metric];
  const trendEnd = page.rangeMode ? page.today : (page.view?.selected_date ?? page.selectedDate);
  const seriesKey = healthCardSeriesKey(metric);
  const anchorValue = page.view?.current
    ? (page.view.current[seriesKey as keyof typeof page.view.current] as number | null | undefined)
    : null;

  return (
    <HealthPageFrame page={page}>
      <HealthMetricDetailShell
        metric={metric}
        backHref={`/my/health${page.queryString}`}
        valueLabel={card?.value ?? "—"}
        totalLabel={card?.total && card.total !== "—" ? card.total : null}
        score={page.view?.scores?.[metric]}
        formula={formula?.formula}
        hint={formula?.hint}
        series={page.view?.series?.[seriesKey] ?? []}
        energyTargets={page.view?.energy_targets}
        rangeDays={page.rangeDays}
        rangeEnd={trendEnd}
        anchorValue={page.rangeMode ? null : typeof anchorValue === "number" ? anchorValue : null}
        hours={
          page.rangeMode
            ? null
            : hoursForHealthTrend(metric, cardDetail.detail) ?? valuedHours(page.view?.hourly?.[seriesKey])
        }
      >
        {cardDetail.error ? (
          <p className="text-small text-error">{cardDetail.error}</p>
        ) : (
          <HealthMetricDetail
            metric={metric}
            detail={cardDetail.detail}
            loading={cardDetail.loading}
            energyTargets={page.view?.energy_targets}
            rangeMode={page.rangeMode}
            rangeDays={page.rangeDays}
          />
        )}
      </HealthMetricDetailShell>
    </HealthPageFrame>
  );
}

export default function HealthMetricPage() {
  return (
    <Suspense fallback={<HealthMetricPageFallback />}>
      <HealthMetricPageInner />
    </Suspense>
  );
}
