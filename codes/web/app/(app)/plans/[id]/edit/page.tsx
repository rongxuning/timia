"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { PlanEditorForm, type PlanEditorSubmitData } from "@/components/plans/PlanEditorForm";
import { planApiMessage } from "@/components/plans/planLabels";
import { takePlanSlotDraft, type PlanSlotDraftStorage } from "@/components/plans/planSlots";
import {
  fetchPlanDetail,
  putPlanSlots,
  updatePlanTemplate,
  type PlanDetailOut,
  type PlanSlotPut,
} from "@/lib/api/plans";
import { getToken } from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";

export default function EditPlanPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const planId = params.id;
  const me = useCurrentMe();
  const [plan, setPlan] = useState<PlanDetailOut | null>(null);
  const [draftSlotPuts, setDraftSlotPuts] = useState<PlanSlotPut[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftTakenForId = useRef<string | null>(null);
  const draftRef = useRef<PlanSlotDraftStorage | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    if (draftTakenForId.current !== planId) {
      draftTakenForId.current = planId;
      draftRef.current = takePlanSlotDraft(planId);
    }
    const draft = draftRef.current;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDraftSlotPuts(null);
    setPlan(null);
    fetchPlanDetail(token, planId)
      .then((data) => {
        if (cancelled) return;
        if (draft) {
          setDraftSlotPuts(draft.slots);
          setError(draft.error);
        }
        setPlan(data);
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

  async function handleSubmit(data: PlanEditorSubmitData) {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updatePlanTemplate(token, planId, {
        title: data.title,
        description: data.description,
        creator_intro: data.creator_intro,
        visibility: data.visibility,
        tags: data.tags,
      });
      await putPlanSlots(token, planId, data.slots);
      router.push(`/plans/${planId}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "保存失败";
      setError(planApiMessage(message));
      setSubmitting(false);
    }
  }

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="mx-auto max-w-4xl space-y-lg">
        <div>
          <h1 className="font-subhead text-subhead text-text-primary">编辑规划</h1>
          <p className="mt-1 text-small text-text-secondary">类型和周期创建后不可更改</p>
        </div>

        {error && !plan ? (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
            加载中…
          </div>
        ) : plan && me && !isOwner ? (
          <div className="space-y-3 rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
            <p>只有创建人可以编辑这份规划</p>
            <Link href={`/plans/${planId}`} className="text-indigo-700 hover:underline">
              返回详情
            </Link>
          </div>
        ) : plan ? (
          <PlanEditorForm
            mode="edit"
            cancelHref={`/plans/${planId}`}
            submitting={submitting}
            error={error}
            initialSlotPuts={draftSlotPuts}
            initial={{
              usage_kind: plan.usage_kind,
              period_kind: plan.period_kind,
              title: plan.title,
              description: plan.description,
              creator_intro: plan.creator_intro,
              visibility: plan.visibility,
              tags: plan.tags ?? [],
              slots: plan.slots ?? [],
            }}
            onSubmit={handleSubmit}
          />
        ) : null}
      </div>
    </PageMain>
  );
}
