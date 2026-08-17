"use client";

import type { PlanCardOut } from "@/lib/api/plans";
import { PlanCard } from "./PlanCard";
import { PlanImportedPanel } from "./PlanImportedPanel";
import { PlanSubscribedPanel } from "./PlanSubscribedPanel";
import { PlanFilters, PlanTabBar, type PlanFilterValues, type PlanTab } from "./PlanFilters";

export type PlanListProps = {
  tab: PlanTab;
  filters: PlanFilterValues;
  items: PlanCardOut[];
  loading: boolean;
  onFiltersChange: (next: PlanFilterValues) => void;
};

export function PlanList({ tab, filters, items, loading, onFiltersChange }: PlanListProps) {
  return (
    <div className="space-y-lg">
      <PlanTabBar tab={tab} filters={filters} />

      {tab === "imported" ? <PlanImportedPanel /> : null}
      {tab === "subscribed" ? <PlanSubscribedPanel /> : null}

      {tab === "discover" || tab === "created" ? (
        <>
          <PlanFilters tab={tab} value={filters} onChange={onFiltersChange} />

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
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
