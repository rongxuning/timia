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
import {
  buildImportWeekDays,
  formatImportTaskClockRange,
  IMPORT_VISIBLE_TASK_SLOTS,
  type ImportPreviewTask,
} from "./planImportPreview";

type Props = {
  open: boolean;
  token: string;
  subscriptionId: string;
  periodKind: string;
  onClose: () => void;
  onSuccess?: () => void;
};

function taskMeta(task: ImportPreviewTask): string {
  const when = formatImportTaskClockRange(task.start_at, task.end_at, task.all_day);
  if (task.location) return when ? `${when} · ${task.location}` : task.location;
  return when;
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
  const tasks = preview?.tasks ?? [];
  const weekDays = preview ? buildImportWeekDays(preview.period_start, tasks) : [];
  const gapCount = IMPORT_VISIBLE_TASK_SLOTS - 1;
  const taskColumnWidth = `calc((100cqw - ${gapCount} * 0.375rem) / ${IMPORT_VISIBLE_TASK_SLOTS})`;
  const taskSlotStyle = { flex: `0 0 ${taskColumnWidth}` };

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
          className="flex w-[min(72rem,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface p-5 shadow-sm"
        >
          <h2 id={titleId} className="shrink-0 font-semibold font-subhead text-text-primary">
            导入本期
          </h2>
          {loading ? (
            <p className="mt-4 shrink-0 text-small text-text-secondary">加载中…</p>
          ) : null}
          {preview ? (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
              <div className="shrink-0 rounded-xl bg-indigo-50 px-3 py-2">
                <p className="text-small text-indigo-900">周期 {range}</p>
                <p className="text-small text-indigo-800">写入 {target}</p>
              </div>
              {tasks.length === 0 ? (
                <p className="shrink-0 text-small text-text-secondary">本周期没有可导入的任务</p>
              ) : null}
              <div
                className="grid min-h-0 grid-rows-7 overflow-hidden rounded-xl border border-border-subtle"
                style={{ height: "min(22rem, calc(100vh - 18rem))" }}
              >
                {weekDays.map((day) => (
                  <div
                    key={day.key}
                    className="flex min-h-0 border-b border-border-subtle last:border-b-0"
                  >
                    <div className="flex w-14 shrink-0 flex-col items-center justify-center border-r border-border-subtle bg-surface-container-low px-1">
                      <span className="text-[11px] font-medium leading-4 text-text-primary">
                        {day.weekdayLabel}
                      </span>
                      <span className="text-[10px] leading-4 text-text-secondary tabular-nums">
                        {day.monthDayLabel}
                      </span>
                    </div>
                    <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden p-1 [container-type:inline-size] [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-outline-variant">
                      <div className="flex h-full w-max gap-1.5">
                        {day.tasks.map((task, index) => {
                          const meta = taskMeta(task);
                          return (
                            <div
                              key={`${task.title}-${task.start_at}-${index}`}
                              className="flex min-h-0 min-w-0 flex-col justify-center overflow-hidden rounded-md border border-border-subtle bg-white px-1.5 py-0.5"
                              style={taskSlotStyle}
                              title={meta ? `${task.title} ${meta}` : task.title}
                            >
                              <p className="truncate text-[11px] font-medium leading-4 text-text-primary">
                                {task.title}
                              </p>
                              {meta ? (
                                <p className="truncate text-[10px] leading-4 text-text-secondary">
                                  {meta}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {error ? <p className="mt-3 shrink-0 text-small text-error">{error}</p> : null}
          <div className="mt-4 flex shrink-0 justify-end gap-2">
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
