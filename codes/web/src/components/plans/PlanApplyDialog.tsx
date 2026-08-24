"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
import { applyPlan } from "@/lib/api/plans";
import { planApiMessage } from "./planLabels";
import { dispatchPlanBadgeRefresh } from "./planEvents";
import {
  formatDateAnchor,
  formatPeriodRange,
  parsePeriodStartAnchor,
  periodStartAnchor,
  sundayWeekStart,
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

export function PlanApplyDialog({
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
  const [periodStart, setPeriodStart] = useState(() => periodStartAnchor(periodKind, new Date()));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEscapeDismiss({ open, onDismiss: onClose, disabled: submitting });

  useEffect(() => {
    if (!open) return;
    setWorkspaceId("");
    setProjectId("");
    setPeriodStart(periodStartAnchor(periodKind, new Date()));
    setError(null);
    setSubmitting(false);
  }, [open, periodKind]);

  const periodDate = parsePeriodStartAnchor(periodStart);
  const range = formatPeriodRange(periodKind, periodDate);

  function onPeriodInput(raw: string) {
    if (!raw) return;
    if (periodKind === "week") {
      setPeriodStart(formatDateAnchor(sundayWeekStart(parsePeriodStartAnchor(raw))));
      return;
    }
    if (periodKind === "month") {
      const [year, month] = raw.split("-").map(Number);
      if (!year || !month) return;
      setPeriodStart(formatDateAnchor(new Date(year, month - 1, 1)));
      return;
    }
    if (periodKind === "year") {
      const year = Number(raw);
      if (!Number.isFinite(year) || year < 1970) return;
      setPeriodStart(formatDateAnchor(new Date(year, 0, 1)));
      return;
    }
    setPeriodStart(raw);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId || !projectId) {
      setError("请选择工作空间和项目");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await applyPlan(token, templateId, {
        workspace_id: workspaceId,
        project_id: projectId,
        period_start: periodStart,
      });
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
            计划模式 · 导入
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
              <span className="text-sm font-medium text-on-surface-variant">导入周期</span>
              {periodKind === "month" ? (
                <input
                  type="month"
                  className={FIELD_CLASS}
                  value={`${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, "0")}`}
                  onChange={(event) => onPeriodInput(event.target.value)}
                  disabled={submitting}
                />
              ) : periodKind === "year" ? (
                <input
                  type="number"
                  className={FIELD_CLASS}
                  min={1970}
                  max={2100}
                  value={periodDate.getFullYear()}
                  onChange={(event) => onPeriodInput(event.target.value)}
                  disabled={submitting}
                />
              ) : (
                <input
                  type="date"
                  className={FIELD_CLASS}
                  value={periodStart}
                  onChange={(event) => onPeriodInput(event.target.value)}
                  disabled={submitting}
                />
              )}
              {periodKind === "week" ? (
                <span className="block text-caption text-neutral-muted">
                  选择该周任意一天，将按周日到周六导入
                </span>
              ) : null}
            </label>
            <p className="text-small text-text-secondary">
              将导入 {slotCount} 个任务（{range}）
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
                {submitting ? "导入中…" : "导入"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
