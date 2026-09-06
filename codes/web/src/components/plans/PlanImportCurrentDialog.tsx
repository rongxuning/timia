"use client";

import { useEffect, useId, useState } from "react";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
import {
  fetchSubscriptionCurrentPeriod,
  importSubscriptionCurrentPeriod,
  type PlanCurrentPeriodPreviewOut,
} from "@/lib/api/plans";
import { formatPeriodRange, parsePeriodStartAnchor } from "./planPeriod";
import { planApiMessage } from "./planLabels";
import { dispatchPlanBadgeRefresh } from "./planEvents";
import { formatWorkspaceProjectLabel } from "./planSubscribedUtils";

type Props = {
  open: boolean;
  token: string;
  subscriptionId: string;
  periodKind: string;
  onClose: () => void;
  onSuccess?: () => void;
};

function formatTaskWhen(startAt: string, endAt: string, allDay: boolean): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const dateLabel = start.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  if (allDay) return `${dateLabel} 全天`;
  const startTime = start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const endTime = end.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  return `${dateLabel} ${startTime}–${endTime}`;
}

export function PlanImportCurrentDialog({
  open,
  token,
  subscriptionId,
  periodKind,
  onClose,
  onSuccess,
}: Props) {
  const titleId = useId();
  const [preview, setPreview] = useState<PlanCurrentPeriodPreviewOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeDismiss({ open, onDismiss: onClose, disabled: submitting || loading });

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      setSubmitting(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSubscriptionCurrentPeriod(token, subscriptionId)
      .then((data) => {
        if (!cancelled) setPreview(data);
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
  }, [open, token, subscriptionId]);

  async function onConfirm() {
    if (!preview || preview.already_imported) return;
    setSubmitting(true);
    setError(null);
    try {
      await importSubscriptionCurrentPeriod(token, subscriptionId);
      dispatchPlanBadgeRefresh();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "导入失败";
      setError(planApiMessage(message));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const range = preview
    ? formatPeriodRange(periodKind, parsePeriodStartAnchor(preview.period_start))
    : "";
  const target = preview
    ? formatWorkspaceProjectLabel(preview.workspace_name, preview.project_name)
    : "";

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!submitting && !loading) onClose();
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
            导入本期
          </h2>
          {loading ? (
            <p className="text-small text-text-secondary">加载中…</p>
          ) : null}
          {preview ? (
            <div className="space-y-3">
              <p className="text-small text-text-secondary">周期 {range}</p>
              <p className="text-small text-text-secondary">写入 {target}</p>
              {preview.tasks.length === 0 ? (
                <p className="text-small text-text-secondary">本周期没有可导入的任务</p>
              ) : (
                <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle">
                  {preview.tasks.map((task, index) => (
                    <li key={`${task.title}-${task.start_at}-${index}`} className="px-3 py-2.5">
                      <p className="text-small text-text-primary">{task.title}</p>
                      <p className="text-caption text-text-secondary">
                        {formatTaskWhen(task.start_at, task.end_at, task.all_day)}
                        {task.location ? ` · ${task.location}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {error ? <p className="text-small text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-border-subtle bg-white px-4 py-2 text-small text-text-secondary hover:bg-gray-50 disabled:opacity-50"
              onClick={onClose}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-xl bg-primary px-4 py-2 text-small text-on-primary disabled:opacity-50"
              onClick={() => void onConfirm()}
              disabled={submitting || loading || !preview || preview.already_imported}
            >
              {submitting ? "导入中…" : "确认导入"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
