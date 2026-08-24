"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchImportedPlans,
  planFilterQueryParams,
  updatePlanFavorite,
  type PlanImportedRowOut,
  type PlanRunItemOut,
} from "@/lib/api/plans";
import { getToken } from "@/lib/auth";
import type { PlanFilterValues } from "./PlanFilters";
import { PlanFavoriteButton } from "./PlanFavoriteButton";
import { planApiMessage } from "./planLabels";
import { formatPeriodRange, parsePeriodStartAnchor } from "./planPeriod";
import { formatWorkspaceProjectLabel, planPeriodDetailHref } from "./planSubscribedUtils";

function formatAppliedAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
}

function formatTaskLine(items: PlanRunItemOut[] | undefined): string {
  const titles = (items ?? []).map((item) => item.title).filter(Boolean);
  return titles.length > 0 ? titles.join("、") : "暂无任务";
}

export function PlanImportedPanel({ filters }: { filters: PlanFilterValues }) {
  const [items, setItems] = useState<PlanImportedRowOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    fetchImportedPlans(token, { ...planFilterQueryParams(filters), limit: 50 })
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

  async function onFavoriteToggle(row: PlanImportedRowOut, next: boolean) {
    const token = getToken();
    if (!token) return;
    setFavoritingId(row.id);
    setError(null);
    try {
      await updatePlanFavorite(token, row.id, next);
      setItems((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, is_favorite: next } : item)),
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

  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
        加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
        {error}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
        暂无已加入的规划
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      {items.map((row) => {
        const runs = row.runs ?? [];
        return (
          <article
            key={row.id}
            className="space-y-3 rounded-xl border border-border-subtle bg-white p-lg"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/plans/${row.id}`}
                  className="font-subhead text-lg font-bold text-text-primary hover:underline"
                >
                  {row.title}
                </Link>
                <p className="mt-1 text-caption text-neutral-muted">
                  已导入 {row.my_import_count} 次
                </p>
              </div>
              <PlanFavoriteButton
                isFavorite={Boolean(row.is_favorite)}
                disabled={favoritingId === row.id}
                onToggle={() => onFavoriteToggle(row, !row.is_favorite)}
              />
            </div>
            {runs.length === 0 ? (
              <p className="text-caption text-neutral-muted">暂无导入记录</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border-subtle">
                <table className="min-w-full table-fixed text-left text-small">
                  <colgroup>
                    <col className="w-[11.5rem]" />
                    <col className="w-[9.5rem]" />
                    <col className="w-[10em]" />
                    <col />
                    <col className="w-[4.5rem]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border-subtle bg-indigo-50/40 text-caption text-neutral-muted">
                      <th className="whitespace-nowrap px-3 py-2 font-medium">导入周期</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">导入时间</th>
                      <th className="px-3 py-2 font-medium">导入空间/项目</th>
                      <th className="px-3 py-2 font-medium">任务</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => {
                      const start = parsePeriodStartAnchor(run.period_start);
                      const taskLine = formatTaskLine(run.items);
                      const workspaceProjectLabel = formatWorkspaceProjectLabel(
                        run.workspace_name ?? "",
                        run.project_name ?? "",
                      );
                      return (
                        <tr
                          key={`${row.id}-${run.workspace_id}-${run.project_id}-${run.period_start}-${run.applied_at ?? ""}`}
                          className="border-b border-border-subtle/80 last:border-b-0"
                        >
                          <td className="whitespace-nowrap px-3 py-2.5 text-text-primary">
                            {formatPeriodRange(row.period_kind, start)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                            {formatAppliedAt(run.applied_at)}
                          </td>
                          <td
                            className="truncate px-3 py-2.5 text-text-secondary"
                            title={workspaceProjectLabel}
                          >
                            {workspaceProjectLabel}
                          </td>
                          <td className="truncate px-3 py-2.5 text-text-secondary" title={taskLine}>
                            {taskLine}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            <Link
                              href={planPeriodDetailHref(
                                row.id,
                                run.period_start,
                                run.workspace_id,
                                run.project_id,
                              )}
                              className="inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-caption text-indigo-700 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
                            >
                              查看
                            </Link>
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
    </div>
  );
}
