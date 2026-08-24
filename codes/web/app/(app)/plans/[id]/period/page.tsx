"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageMain } from "@/components/layout";
import { primePlanNameForBreadcrumb } from "@/components/Breadcrumbs";
import { PlanSlotEditor } from "@/components/plans/PlanSlotEditor";
import { planApiMessage } from "@/components/plans/planLabels";
import { formatPeriodRange, parsePeriodStartAnchor } from "@/components/plans/planPeriod";
import { slotOutToDraft } from "@/components/plans/planSlots";
import { fetchPlanDetail, type PlanDetailOut } from "@/lib/api/plans";
import { getToken } from "@/lib/auth";

function PlanPeriodPageFallback() {
  return (
    <PageMain className="!px-3" fullWidth>
      <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
        加载中…
      </div>
    </PageMain>
  );
}

function PlanPeriodPageInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const planId = params.id;
  const periodStartRaw = searchParams.get("period_start") ?? "";
  const workspaceId = searchParams.get("workspace_id") ?? "";
  const projectId = searchParams.get("project_id") ?? "";

  const periodStart = useMemo(() => {
    if (!periodStartRaw) return null;
    try {
      return parsePeriodStartAnchor(periodStartRaw);
    } catch {
      return null;
    }
  }, [periodStartRaw]);

  const [plan, setPlan] = useState<PlanDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPlan = useCallback(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    if (!periodStart) {
      setError("缺少周期参数");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPlanDetail(token, planId)
      .then((data) => {
        if (!cancelled) {
          primePlanNameForBreadcrumb(data.id, data.title);
          setPlan(data);
        }
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setError(planApiMessage(err?.message ?? "加载失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planId, periodStart, router]);

  useEffect(() => loadPlan(), [loadPlan]);

  const slots = (plan?.slots ?? []).map(slotOutToDraft);
  const periodLabel =
    plan && periodStart ? formatPeriodRange(plan.period_kind, periodStart) : periodStartRaw;

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="space-y-lg">
        {error ? (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
            加载中…
          </div>
        ) : plan && periodStart ? (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-subhead text-subhead text-text-primary">{plan.title}</h1>
                  <p className="mt-1 text-caption text-text-secondary">{periodLabel}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {workspaceId && projectId ? (
                    <Link
                      href={`/workspace/${workspaceId}/projects/${projectId}`}
                      className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-small text-indigo-700 hover:bg-indigo-100"
                    >
                      在项目日程中查看
                    </Link>
                  ) : null}
                  <Link
                    href={`/plans?tab=subscribed`}
                    className="rounded-xl border border-border-subtle bg-white px-4 py-2 text-small text-text-secondary hover:bg-gray-50"
                  >
                    返回订阅中
                  </Link>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-white p-lg">
              <PlanSlotEditor
                periodKind={plan.period_kind}
                slots={slots}
                readOnly
                guide="以下为该规划在本周期内的相对时段排布"
              />
            </div>
          </>
        ) : null}
      </div>
    </PageMain>
  );
}

export default function PlanPeriodPage() {
  return (
    <Suspense fallback={<PlanPeriodPageFallback />}>
      <PlanPeriodPageInner />
    </Suspense>
  );
}
