"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { HealthPageFrame } from "@/components/health/HealthPageFrame";
import { MyHealthCards } from "@/components/health/MyHealthCards";
import { MyHealthInsight } from "@/components/health/MyHealthInsight";
import { MyHealthWorkouts } from "@/components/health/MyHealthWorkouts";
import { PageMain } from "@/components/layout";
import { useMyHealthPage } from "@/hooks/useMyHealthPage";
import type { MyHealthView } from "@/types/api/views/health";

function hasHealthData(view: MyHealthView | null): boolean {
  if (!view) return false;
  if ((view.calendar_days ?? []).some((day) => day.has_metrics || day.has_workout || day.has_insight)) {
    return true;
  }
  const currentValues = Object.values(view.current ?? {});
  if (currentValues.some((value) => value != null)) return true;
  if ((view.recent_workouts?.length ?? 0) > 0) return true;
  if (view.workout_has_more) return true;
  return Object.values(view.series ?? {}).some((points) => points.some((point) => point.value != null));
}

function MyHealthPageFallback() {
  return (
    <PageMain className="!px-3" fullWidth>
      <p className="text-small text-text-secondary">加载中…</p>
    </PageMain>
  );
}

function MyHealthPageInner() {
  const router = useRouter();
  const page = useMyHealthPage();
  const { view, loading, token, queryString, rangeMode } = page;
  const empty = !loading && !page.error && !hasHealthData(view);

  return (
    <HealthPageFrame page={page}>
      {empty ? (
        <section className="rounded-xl border border-border-subtle bg-white p-lg">
          <p className="text-small text-text-primary">还没有健康数据。</p>
          <p className="mt-2 text-small text-text-secondary">
            请在 iPhone 上打开 Timia → 我的 → 健康与健身，授权并同步。网页不会申请健康权限。
          </p>
        </section>
      ) : (
        <>
          <MyHealthCards
            current={view?.current}
            totals={view?.totals}
            scores={view?.scores}
            scoreFormulas={view?.score_formulas}
            cardOrder={view?.card_order}
            series={view?.series ?? {}}
            loading={loading}
            rangeMode={rangeMode}
            onReorder={page.saveLayout}
            onOpenDetail={(key) => router.push(`/my/health/${key}${queryString}`)}
          />
          <MyHealthInsight
            insight={view?.insight ?? null}
            insights={view?.insights ?? []}
            rangeMode={rangeMode}
            loading={loading}
          />
          <MyHealthWorkouts
            token={token}
            ready={view != null}
            initialWorkouts={view?.recent_workouts ?? []}
            initialHasMore={view?.workout_has_more ?? false}
            initialEndDate={view?.workout_end_date ?? null}
            timezone={view?.timezone}
            queryString={queryString}
          />
        </>
      )}
    </HealthPageFrame>
  );
}

export default function MyHealthPage() {
  return (
    <Suspense fallback={<MyHealthPageFallback />}>
      <MyHealthPageInner />
    </Suspense>
  );
}
