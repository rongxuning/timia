"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { PlanComments } from "@/components/plans/PlanComments";
import { PlanDetailActions } from "@/components/plans/PlanDetailActions";
import { PlanSlotEditor } from "@/components/plans/PlanSlotEditor";
import {
  PLAN_PERIOD_LABEL,
  PLAN_USAGE_LABEL,
  PLAN_VISIBILITY_LABEL,
  planApiMessage,
  planLabel,
} from "@/components/plans/planLabels";
import { slotOutToDraft } from "@/components/plans/planSlots";
import { fetchPlanDetail, type PlanDetailOut } from "@/lib/api/plans";
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

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
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

  const isOwner = !!me?.id && me.id === plan?.creator.id;
  const slots = (plan?.slots ?? []).map(slotOutToDraft);

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
                <PlanDetailActions usageKind={plan.usage_kind} mySubscription={plan.my_subscription} />
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
          </>
        ) : null}
      </div>
    </PageMain>
  );
}
