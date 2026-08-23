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
import { planApiMessage } from "./planLabels";
import { dispatchPlanBadgeRefresh } from "./planEvents";
import { formatPeriodRange, parsePeriodStartAnchor } from "./planPeriod";
import { PlanRunItems } from "./PlanRunItems";

function formatSegmentBound(value: string | null): string {
  if (!value) return "至今";
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
        const segments = row.segments ?? [];
        return (
          <article
            key={row.id}
            className="space-y-4 rounded-xl border border-border-subtle bg-white p-lg"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-start gap-2">
                  <Link
                    href={`/plans/${row.template_id}`}
                    className="font-subhead text-lg font-bold text-text-primary hover:underline"
                  >
                    {row.title}
                  </Link>
                  <PlanFavoriteButton
                    isFavorite={Boolean(row.is_favorite)}
                    disabled={favoritingId === row.template_id}
                    onToggle={() => onFavoriteToggle(row, !row.is_favorite)}
                  />
                </div>
                <p className="mt-1 text-caption text-text-secondary">
                  {row.workspace_name} · {row.project_name}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl border border-border-subtle bg-white px-4 py-2 text-small text-text-secondary hover:bg-gray-50 disabled:opacity-50"
                disabled={busyId === row.id}
                onClick={() => onCancel(row.id)}
              >
                {busyId === row.id ? "取消中…" : "取消订阅"}
              </button>
            </div>

            {pending ? (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-small font-medium text-indigo-900">待确认导入</p>
                <p className="mt-1 text-caption text-indigo-800">
                  {formatPeriodRange(row.period_kind, parsePeriodStartAnchor(pending.period_start))}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
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

            <div className="space-y-3">
              <h3 className="text-small font-medium text-text-primary">分段</h3>
              {segments.length === 0 ? (
                <p className="text-caption text-neutral-muted">暂无分段</p>
              ) : (
                <ol className="space-y-3">
                  {segments.map((segment) => {
                    const runs = segment.runs ?? [];
                    const segmentItems = segment.items ?? [];
                    return (
                      <li
                        key={`${row.id}-${segment.started_at}`}
                        className="rounded-lg border border-border-subtle bg-surface-bright/60 p-3"
                      >
                        <p className="text-small text-text-primary">
                          {formatSegmentBound(segment.started_at)} – {formatSegmentBound(segment.ended_at)}
                        </p>
                        <p className="mt-0.5 text-caption text-neutral-muted">
                          导入 {runs.length} 次
                        </p>
                        <div className="mt-2">
                          <PlanRunItems
                            items={segmentItems}
                            workspaceId={row.workspace_id}
                            projectId={row.project_id}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
