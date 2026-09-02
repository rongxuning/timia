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
  // RHR「当日」：始终单日取数（日视图=所选日期，7/30/90=今天），不带 range。
  // HRV「近日SDNN」/ SpO2「近期血氧」需要 range；「当日」另拉一笔不带 range 的当天详情，切 7/30/90 时样本不跟着变。
  const rhrDayScoped = metric === "rhr";
  const hrvPinToday = metric === "hrv" && page.rangeMode;
  const spo2PinToday = metric === "spo2" && page.rangeMode;
  const focusDay = page.rangeMode ? page.today : page.selectedDate;
  const cardDetail = useHealthCardDetail(validMetric ? page.token : null, metric, {
    date: rhrDayScoped ? focusDay : page.selectedDate,
    range: rhrDayScoped ? null : page.rangeDays,
  });
  const hrvDayDetail = useHealthCardDetail(validMetric && hrvPinToday ? page.token : null, "hrv", {
    date: page.today,
    range: null,
  });
  const spo2DayDetail = useHealthCardDetail(validMetric && spo2PinToday ? page.token : null, "spo2", {
    date: page.today,
    range: null,
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
  const detail =
    hrvPinToday && cardDetail.detail && hrvDayDetail.detail
      ? {
          ...cardDetail.detail,
          samples: hrvDayDetail.detail.samples,
          stats: hrvDayDetail.detail.stats,
        }
      : spo2PinToday && cardDetail.detail && spo2DayDetail.detail
        ? {
            ...cardDetail.detail,
            samples: spo2DayDetail.detail.samples,
            stats: spo2DayDetail.detail.stats,
            hourly: spo2DayDetail.detail.hourly,
          }
        : cardDetail.detail;
  const detailLoading =
    cardDetail.loading ||
    (hrvPinToday && hrvDayDetail.loading && !hrvDayDetail.detail) ||
    (spo2PinToday && spo2DayDetail.loading && !spo2DayDetail.detail);
  const detailError =
    cardDetail.error ?? (hrvPinToday ? hrvDayDetail.error : null) ?? (spo2PinToday ? spo2DayDetail.error : null);

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
            : hoursForHealthTrend(metric, detail) ?? valuedHours(page.view?.hourly?.[seriesKey])
        }
      >
        {detailError ? (
          <p className="text-small text-error">{detailError}</p>
        ) : (
          <HealthMetricDetail
            metric={metric}
            detail={detail}
            loading={detailLoading}
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
