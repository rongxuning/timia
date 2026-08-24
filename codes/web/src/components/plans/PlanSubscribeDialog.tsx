"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
import { subscribePlan } from "@/lib/api/plans";
import { planApiMessage } from "./planLabels";
import { dispatchPlanBadgeRefresh } from "./planEvents";
import {
  currentPeriodStart,
  DEFAULT_PLAN_TIMEZONE,
  formatPeriodRange,
} from "./planPeriod";
import { PlanTargetPickers } from "./PlanTargetPickers";

const FIELD_CLASS =
  "w-full rounded-xl border border-border-subtle bg-surface-bright px-3 py-2 text-small text-text-primary outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-60";

type Props = {
  open: boolean;
  token: string;
  templateId: string;
  periodKind: string;
  slotCount: number;
  onClose: () => void;
  onSuccess?: () => void;
};

export function PlanSubscribeDialog({
  open,
  token,
  templateId,
  periodKind,
  slotCount,
  onClose,
  onSuccess,
}: Props) {
  const titleId = useId();
  const [workspaceId, setWorkspaceId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_PLAN_TIMEZONE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEscapeDismiss({ open, onDismiss: onClose, disabled: submitting });

  useEffect(() => {
    if (!open) return;
    setWorkspaceId("");
    setProjectId("");
    setTimezone(DEFAULT_PLAN_TIMEZONE);
    setError(null);
    setSubmitting(false);
  }, [open]);

  const tz = timezone.trim() || DEFAULT_PLAN_TIMEZONE;
  const currentStart = currentPeriodStart(periodKind, new Date(), tz);
  const range = formatPeriodRange(periodKind, currentStart);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId || !projectId) {
      setError("请选择工作空间和项目");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await subscribePlan(token, templateId, {
        workspace_id: workspaceId,
        project_id: projectId,
        timezone: tz,
      });
      dispatchPlanBadgeRefresh();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "开启订阅失败";
      setError(planApiMessage(message));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-[min(560px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] space-y-5 overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-sm"
        >
          <h2 id={titleId} className="font-semibold font-subhead text-text-primary">
            订阅模式
          </h2>
          <form onSubmit={onSubmit} className="space-y-4">
            <PlanTargetPickers
              token={token}
              workspaceId={workspaceId}
              projectId={projectId}
              onWorkspaceChange={setWorkspaceId}
              onProjectChange={setProjectId}
              disabled={submitting}
            />
            <label className="block space-y-1">
              <span className="text-sm font-medium text-on-surface-variant">时区</span>
              <input
                className={FIELD_CLASS}
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder={DEFAULT_PLAN_TIMEZONE}
                disabled={submitting}
              />
            </label>
            <p className="text-small text-text-secondary">
              将导入本周期 {range} 的 {slotCount} 个任务
            </p>
            {error ? <p className="text-small text-error">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={submitting}>
                取消
              </button>
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 text-small text-on-primary disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? "开启中…" : "开启订阅"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
