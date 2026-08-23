"use client";

import { useState } from "react";
import type { PlanCardOut } from "@/lib/api/plans";
import { updatePlanFavorite } from "@/lib/api/plans";
import { getToken } from "@/lib/auth";
import { PlanCard } from "./PlanCard";
import { PlanImportedPanel } from "./PlanImportedPanel";
import { PlanSubscribedPanel } from "./PlanSubscribedPanel";
import { PlanFilters, PlanTabBar, type PlanFilterValues, type PlanTab } from "./PlanFilters";
import { planApiMessage } from "./planLabels";

export type PlanListProps = {
  tab: PlanTab;
  filters: PlanFilterValues;
  items: PlanCardOut[];
  loading: boolean;
  onFiltersChange: (next: PlanFilterValues) => void;
  onItemsChange?: (items: PlanCardOut[]) => void;
};

export function PlanList({
  tab,
  filters,
  items,
  loading,
  onFiltersChange,
  onItemsChange,
}: PlanListProps) {
  const [favoritingId, setFavoritingId] = useState<string | null>(null);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  async function onFavoriteToggle(plan: PlanCardOut, next: boolean) {
    const token = getToken();
    if (!token) return;
    setFavoritingId(plan.id);
    setFavoriteError(null);
    try {
      await updatePlanFavorite(token, plan.id, next);
      const nextItems = items.map((item) =>
        item.id === plan.id ? { ...item, is_favorite: next } : item,
      );
      onItemsChange?.(nextItems);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "收藏操作失败";
      setFavoriteError(planApiMessage(message));
    } finally {
      setFavoritingId(null);
    }
  }

  return (
    <div className="space-y-lg">
      <PlanTabBar tab={tab} filters={filters} />

      <PlanFilters tab={tab} value={filters} onChange={onFiltersChange} />

      {favoriteError ? (
        <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {favoriteError}
        </div>
      ) : null}

      {tab === "imported" ? <PlanImportedPanel filters={filters} /> : null}
      {tab === "subscribed" ? <PlanSubscribedPanel filters={filters} /> : null}

      {tab === "discover" || tab === "created" ? (
        <>
          {loading ? (
            <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
              加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
              暂无规划
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-sm md:grid-cols-2 xl:grid-cols-4">
              {items.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  favoriting={favoritingId === plan.id}
                  onFavoriteToggle={onFavoriteToggle}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
