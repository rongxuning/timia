"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  fetchImportedPlans,
  planFilterQueryParams,
  updatePlanFavorite,
  type PlanImportedRowOut,
} from "@/lib/api/plans";
import { getToken } from "@/lib/auth";
import type { PlanFilterValues } from "./PlanFilters";
import { PlanFavoriteButton } from "./PlanFavoriteButton";
import { planApiMessage } from "./planLabels";
import { formatPeriodRange, parsePeriodStartAnchor } from "./planPeriod";
import { PlanRunItems } from "./PlanRunItems";

function formatAppliedAt(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN");
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
        暂无已导入的规划
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
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-start gap-2">
                  <Link
                    href={`/plans/${row.id}`}
                    className="font-subhead text-lg font-bold text-text-primary hover:underline"
                  >
                    {row.title}
                  </Link>
                  <PlanFavoriteButton
                    isFavorite={Boolean(row.is_favorite)}
                    disabled={favoritingId === row.id}
                    onToggle={() => onFavoriteToggle(row, !row.is_favorite)}
                  />
                </div>
                <p className="mt-1 text-caption text-neutral-muted">
                  已导入 {row.my_import_count} 次
                </p>
              </div>
            </div>
            <ul className="space-y-3">
              {runs.map((run) => {
                const start = parsePeriodStartAnchor(run.period_start);
                return (
                  <li
                    key={`${row.id}-${run.workspace_id}-${run.project_id}-${run.period_start}-${run.applied_at ?? ""}`}
                    className="rounded-lg border border-border-subtle bg-surface-bright/60 p-3"
                  >
                    <p className="text-small text-text-primary">
                      {formatPeriodRange(row.period_kind, start)}
                    </p>
                    {run.applied_at ? (
                      <p className="mt-0.5 text-caption text-neutral-muted">
                        {formatAppliedAt(run.applied_at)}
                      </p>
                    ) : null}
                    <div className="mt-2">
                      <PlanRunItems
                        items={run.items ?? []}
                        workspaceId={run.workspace_id}
                        projectId={run.project_id}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
