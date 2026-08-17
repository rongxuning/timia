"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { PlanEditorForm, type PlanEditorSubmitData } from "@/components/plans/PlanEditorForm";
import { planApiMessage } from "@/components/plans/planLabels";
import { savePlanSlotDraft } from "@/components/plans/planSlots";
import { createPlanTemplate, putPlanSlots } from "@/lib/api/plans";
import { getToken } from "@/lib/auth";

export default function NewPlanPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  async function handleSubmit(data: PlanEditorSubmitData) {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createPlanTemplate(token, {
        title: data.title,
        description: data.description,
        creator_intro: data.creator_intro,
        usage_kind: data.usage_kind,
        period_kind: data.period_kind,
        visibility: data.visibility,
        tags: data.tags,
      });
      try {
        await putPlanSlots(token, created.id, data.slots);
      } catch (err) {
        const message =
          err && typeof err === "object" && "message" in err
            ? planApiMessage(String((err as { message: string }).message))
            : "时段保存失败";
        const errorText = `${message}。模板已创建，请在编辑页重试。`;
        savePlanSlotDraft(created.id, { slots: data.slots, error: errorText });
        router.push(`/plans/${created.id}/edit`);
        return;
      }
      router.push(`/plans/${created.id}`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "创建失败";
      setError(planApiMessage(message));
      setSubmitting(false);
    }
  }

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="mx-auto max-w-4xl space-y-lg">
        <div>
          <h1 className="font-subhead text-subhead text-text-primary">创建规划</h1>
          <p className="mt-1 text-small text-text-secondary">先选择类型和周期，再填写介绍并编辑相对时段</p>
        </div>
        <PlanEditorForm
          mode="create"
          cancelHref="/plans"
          submitting={submitting}
          error={error}
          onSubmit={handleSubmit}
        />
      </div>
    </PageMain>
  );
}
