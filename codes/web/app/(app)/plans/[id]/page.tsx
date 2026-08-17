"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { PlanApplyDialog } from "@/components/plans/PlanApplyDialog";
import { PlanComments } from "@/components/plans/PlanComments";
import { PlanDetailActions } from "@/components/plans/PlanDetailActions";
import { PlanSlotEditor } from "@/components/plans/PlanSlotEditor";
import { PlanSubscribeDialog } from "@/components/plans/PlanSubscribeDialog";
import { dispatchPlanBadgeRefresh } from "@/components/plans/planEvents";
import {
  PLAN_PERIOD_LABEL,
  PLAN_USAGE_LABEL,
  PLAN_VISIBILITY_LABEL,
  planApiMessage,
  planLabel,
} from "@/components/plans/planLabels";
import { slotOutToDraft } from "@/components/plans/planSlots";
import { cancelPlanSubscription, fetchPlanDetail, type PlanDetailOut } from "@/lib/api/plans";
import { getToken } from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";

export default function PlanDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const planId = params.id;
  const me = useCurrentMe();
  const [plan, setPlan] = useState<PlanDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const loadPlan = useCallback((silent = false) => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    fetchPlanDetail(token, planId)
      .then((data) => {
        if (!cancelled) setPlan(data);
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
  }, [planId, router]);

  useEffect(() => loadPlan(), [loadPlan]);

  const token = getToken();
  const isOwner = !!me?.id && me.id === plan?.creator.id;
  const slots = (plan?.slots ?? []).map(slotOutToDraft);

  async function onCancelSubscribe() {
    const subscriptionId = plan?.my_subscription?.id;
    if (!token || !subscriptionId || cancelLoading) return;
    setActionError(null);
    setCancelLoading(true);
    try {
      await cancelPlanSubscription(token, subscriptionId);
      dispatchPlanBadgeRefresh();
      loadPlan(true);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "取消订阅失败";
      setActionError(planApiMessage(message));
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="mx-auto max-w-4xl space-y-lg">
        <Link href="/plans" className="text-small text-text-secondary hover:text-text-primary">
          ← 返回规划
        </Link>

        {error ? (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        ) : null}

        {actionError ? (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {actionError}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
            加载中…
          </div>
        ) : plan ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <h1 className="font-subhead text-subhead text-text-primary">{plan.title}</h1>
                <p className="flex flex-wrap gap-x-2 gap-y-1 text-caption text-text-secondary">
                  <span>{planLabel(PLAN_USAGE_LABEL, plan.usage_kind)}</span>
                  <span aria-hidden>·</span>
                  <span>{planLabel(PLAN_PERIOD_LABEL, plan.period_kind)}</span>
                  <span aria-hidden>·</span>
                  <span>{planLabel(PLAN_VISIBILITY_LABEL, plan.visibility)}</span>
                  <span aria-hidden>·</span>
                  <span>{plan.creator.display_name}</span>
                </p>
                {(plan.tags ?? []).length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {(plan.tags ?? []).map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full border border-border-subtle bg-surface-bright px-2 py-0.5 text-caption text-text-secondary"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-caption text-neutral-muted">{plan.use_count} 次使用</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {isOwner ? (
                  <Link
                    href={`/plans/${plan.id}/edit`}
                    className="rounded-xl border border-border-subtle bg-white px-4 py-2 text-small text-text-secondary hover:bg-gray-50"
                  >
                    编辑
                  </Link>
                ) : null}
                <PlanDetailActions
                  usageKind={plan.usage_kind}
                  mySubscription={plan.my_subscription}
                  onJoin={() => {
                    setActionError(null);
                    setApplyOpen(true);
                  }}
                  onSubscribe={() => {
                    setActionError(null);
                    setSubscribeOpen(true);
                  }}
                  onCancelSubscribe={onCancelSubscribe}
                />
              </div>
            </div>

            <section className="space-y-2">
              <h2 className="text-small font-medium text-text-primary">介绍</h2>
              <p className="whitespace-pre-wrap text-small text-text-primary">
                {plan.description?.trim() ? plan.description : "暂无介绍"}
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-small font-medium text-text-primary">创建人介绍</h2>
              <p className="whitespace-pre-wrap text-small text-text-primary">
                {plan.creator_intro?.trim() ? plan.creator_intro : "暂无创建人介绍"}
              </p>
            </section>

            <PlanSlotEditor periodKind={plan.period_kind} slots={slots} readOnly />

            <PlanComments templateId={plan.id} />

            {token ? (
              <>
                <PlanApplyDialog
                  open={applyOpen}
                  token={token}
                  templateId={plan.id}
                  periodKind={plan.period_kind}
                  slotCount={plan.slots?.length ?? 0}
                  onClose={() => setApplyOpen(false)}
                  onSuccess={() => loadPlan(true)}
                />
                <PlanSubscribeDialog
                  open={subscribeOpen}
                  token={token}
                  templateId={plan.id}
                  periodKind={plan.period_kind}
                  slotCount={plan.slots?.length ?? 0}
                  onClose={() => setSubscribeOpen(false)}
                  onSuccess={() => loadPlan(true)}
                />
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </PageMain>
  );
}
