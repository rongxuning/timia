"use client";

import { Suspense, useCallback } from "react";
import { useParams } from "next/navigation";
import { HealthPageFrame } from "@/components/health/HealthPageFrame";
import { WorkoutDetailSummary } from "@/components/health/WorkoutDetailSummary";
import { PageMain } from "@/components/layout";
import { useHealthWorkoutDetail } from "@/hooks/useHealthWorkoutDetail";
import { useMyHealthPage } from "@/hooks/useMyHealthPage";

function WorkoutDetailFallback() {
  return (
    <PageMain className="!px-3" fullWidth>
      <p className="text-small text-text-secondary">加载中…</p>
    </PageMain>
  );
}

function WorkoutDetailPageInner() {
  const params = useParams<{ id: string }>();
  const page = useMyHealthPage();
  const workout = useHealthWorkoutDetail(page.token, params.id);

  const saveProfile = useCallback(
    (payload: Parameters<typeof page.saveProfile>[0]) =>
      Promise.resolve(page.saveProfile(payload)).then((ok) => {
        if (ok) workout.reload();
      }),
    [page.saveProfile, workout.reload],
  );

  const framePage = { ...page, saveProfile };

  return (
    <HealthPageFrame page={framePage}>
      {workout.error ? (
        <p className="text-small text-error">{workout.error}</p>
      ) : workout.loading && !workout.detail ? (
        <p className="text-small text-text-secondary">加载中…</p>
      ) : workout.detail ? (
        <WorkoutDetailSummary workout={workout.detail} timezone={page.view?.timezone} />
      ) : null}
    </HealthPageFrame>
  );
}

export default function WorkoutDetailPage() {
  return (
    <Suspense fallback={<WorkoutDetailFallback />}>
      <WorkoutDetailPageInner />
    </Suspense>
  );
}
