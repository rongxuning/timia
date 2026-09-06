"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  cancelPlanSubscription,
  confirmPlanApplyRun,
  fetchSubscribedPlans,
  planFilterQueryParams,
  skipPlanApplyRun,
  updatePlanFavorite,
  type PlanPendingRunOut,
  type PlanSubscribedRowOut,
} from "@/lib/api/plans";
import { getToken } from "@/lib/auth";
import type { PlanFilterValues } from "./PlanFilters";
import { PlanFavoriteButton } from "./PlanFavoriteButton";
import { PlanImportCurrentDialog } from "./PlanImportCurrentDialog";
import { planApiMessage } from "./planLabels";
import { dispatchPlanBadgeRefresh } from "./planEvents";
import { formatPeriodRange, parsePeriodStartAnchor } from "./planPeriod";
import {
  flattenSubscribedPeriodRows,
  formatSubscribedTaskLabel,
  formatWorkspaceProjectLabel,
  planPeriodDetailHref,
} from "./planSubscribedUtils";
import { PLAN_RUN_STATUS_LABEL, planLabel } from "./planLabels";

function formatRunCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

export function PlanSubscribedPanel({ filters }: { filters: PlanFilterValues }) {
  const [items, setItems] = useState<PlanSubscribedRowOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [favoritingId, setFavoritingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const load = useCallback(() => {
    const token = getToken();
    if (!token) {
      setError("请先登录");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSubscribedPlans(token, { ...planFilterQueryParams(filters), limit: 50 })
      .then((data) => {
        if (!cancelled) setItems(data.items);
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
  }, [filters]);

  useEffect(() => load(), [load]);

  async function onFavoriteToggle(row: PlanSubscribedRowOut, next: boolean) {
    const token = getToken();
    if (!token) return;
    setFavoritingId(row.template_id);
    setError(null);
    try {
      await updatePlanFavorite(token, row.template_id, next);
      setItems((prev) =>
        prev.map((item) =>
          item.template_id === row.template_id ? { ...item, is_favorite: next } : item,
        ),
      );
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "收藏操作失败";
      setError(planApiMessage(message));
    } finally {
      setFavoritingId(null);
    }
  }

  async function refreshAfterMutation() {
    dispatchPlanBadgeRefresh();
    load();
  }

  async function onConfirm(run: PlanPendingRunOut) {
    const token = getToken();
    if (!token) return;
    setBusyId(run.id);
    setError(null);
    try {
      await confirmPlanApplyRun(token, run.id);
      await refreshAfterMutation();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "确认失败";
      setError(planApiMessage(message));
    } finally {
      setBusyId(null);
    }
  }

  async function onSkip(run: PlanPendingRunOut) {
    const token = getToken();
    if (!token) return;
    setBusyId(run.id);
    setError(null);
    try {
      await skipPlanApplyRun(token, run.id);
      await refreshAfterMutation();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "跳过失败";
      setError(planApiMessage(message));
    } finally {
      setBusyId(null);
    }
  }

  async function onCancel(subscriptionId: string) {
    const token = getToken();
    if (!token) return;
    setBusyId(subscriptionId);
    setError(null);
    try {
      await cancelPlanSubscription(token, subscriptionId);
      await refreshAfterMutation();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "取消订阅失败";
      setError(planApiMessage(message));
    } finally {
      setBusyId(null);
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      {error ? (
        <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {error}
        </div>
      ) : null}
      {items.length === 0 && !loading ? (
        <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
          暂无进行中的订阅
        </div>
      ) : null}
      {items.map((row) => {
        const pending = row.pending_run ?? null;
        const periodRows = flattenSubscribedPeriodRows(row.segments ?? []);
        return (
          <article
            key={row.id}
            className="space-y-4 rounded-xl border border-border-subtle bg-white p-lg"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Link
                  href={`/plans/${row.template_id}`}
                  className="min-w-0 truncate font-subhead text-lg font-bold text-text-primary transition-colors hover:text-indigo-600"
                >
                  {row.title}
                </Link>
                <PlanFavoriteButton
                  isFavorite={Boolean(row.is_favorite)}
                  disabled={favoritingId === row.template_id}
                  onToggle={() => onFavoriteToggle(row, !row.is_favorite)}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {row.current_period_imported ? null : (
                  <button
                    type="button"
                    className="rounded-xl bg-primary px-4 py-2 text-small text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
                    disabled={busyId === row.id}
                    onClick={() => setImportingId(row.id)}
                  >
                    导入本期
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-small text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100 disabled:opacity-50"
                  disabled={busyId === row.id}
                  onClick={() => onCancel(row.id)}
                >
                  {busyId === row.id ? "取消中…" : "取消订阅"}
                </button>
              </div>
            </div>

            {pending ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-small font-medium text-indigo-900">待确认导入</p>
                <p className="mt-1 text-caption text-indigo-800">
                  {formatPeriodRange(row.period_kind, parsePeriodStartAnchor(pending.period_start))}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={planPeriodDetailHref(
                      row.template_id,
                      pending.period_start,
                      row.workspace_id,
                      row.project_id,
                    )}
                    className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-small text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
                  >
                    查看
                  </Link>
                  <button
                    type="button"
                    className="rounded-xl bg-primary px-4 py-2 text-small text-on-primary disabled:opacity-50"
                    disabled={busyId === pending.id}
                    onClick={() => onConfirm(pending)}
                  >
                    确认
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-border-subtle bg-white px-4 py-2 text-small text-text-secondary hover:bg-gray-50 disabled:opacity-50"
                    disabled={busyId === pending.id}
                    onClick={() => onSkip(pending)}
                  >
                    跳过
                  </button>
                </div>
              </div>
            ) : null}

            {periodRows.length === 0 ? (
              <p className="text-caption text-neutral-muted">暂无已导入周期</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border-subtle">
                <table className="min-w-full table-fixed text-left text-small">
                  <colgroup>
                    <col className="w-[11.5rem]" />
                    <col className="w-[9.5rem]" />
                    <col className="w-[10em]" />
                    <col />
                    <col className="w-[4.5rem]" />
                    <col className="w-[4.5rem]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border-subtle bg-indigo-50/40 text-caption text-neutral-muted">
                      <th className="whitespace-nowrap px-3 py-2 font-medium">订阅周期</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">订阅时间</th>
                      <th className="px-3 py-2 font-medium">订阅空间/项目</th>
                      <th className="px-3 py-2 font-medium">任务</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">状态</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodRows.map((periodRow) => {
                      const taskLabel = formatSubscribedTaskLabel(periodRow.status, periodRow.items);
                      const statusLabel = planLabel(PLAN_RUN_STATUS_LABEL, periodRow.status);
                      const workspaceProjectLabel = formatWorkspaceProjectLabel(
                        periodRow.workspaceName,
                        periodRow.projectName,
                      );
                      const canViewPeriod = ["applied", "expired", "skipped"].includes(periodRow.status);
                      return (
                        <tr
                          key={periodRow.key}
                          className="border-b border-border-subtle/80 last:border-b-0"
                        >
                          <td className="whitespace-nowrap px-3 py-2.5 text-text-primary">
                            {formatPeriodRange(
                              row.period_kind,
                              parsePeriodStartAnchor(periodRow.periodStart),
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                            {formatRunCreatedAt(periodRow.createdAt)}
                          </td>
                          <td className="truncate px-3 py-2.5 text-text-secondary" title={workspaceProjectLabel}>
                            {workspaceProjectLabel}
                          </td>
                          <td className="truncate px-3 py-2.5 text-text-secondary" title={taskLabel}>
                            {taskLabel}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{statusLabel}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            {canViewPeriod ? (
                              <Link
                                href={planPeriodDetailHref(
                                  row.template_id,
                                  periodRow.periodStart,
                                  periodRow.workspaceId,
                                  periodRow.projectId,
                                )}
                                className="inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-caption text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
                              >
                                查看
                              </Link>
                            ) : (
                              <span className="text-caption text-neutral-muted">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        );
      })}
      {importingId ? (
        <PlanImportCurrentDialog
          open
          token={getToken() ?? ""}
          subscriptionId={importingId}
          periodKind={items.find((item) => item.id === importingId)?.period_kind ?? "week"}
          onClose={() => setImportingId(null)}
          onSuccess={() => {
            void refreshAfterMutation();
          }}
        />
      ) : null}
    </div>
  );
}
