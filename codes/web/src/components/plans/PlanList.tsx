import Link from "next/link";
import type { PlanCardOut } from "@/lib/api/plans";
import { PlanCard } from "./PlanCard";
import {
  PLAN_TABS,
  PLAN_TAB_LABELS,
  PlanFilters,
  planListHref,
  type PlanFilterValues,
  type PlanTab,
} from "./PlanFilters";

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
      <div role="tablist" aria-label="规划列表" className="flex flex-wrap gap-1">
        {PLAN_TABS.map((id) => {
          const selected = tab === id;
          return (
            <Link
              key={id}
              role="tab"
              aria-selected={selected}
              href={planListHref(id, filters)}
              scroll={false}
              className={
                selected
                  ? "rounded-lg bg-indigo-50 px-3 py-1.5 text-small font-medium text-indigo-700"
                  : "rounded-lg px-3 py-1.5 text-small font-medium text-text-secondary transition-colors hover:bg-gray-100"
              }
            >
              {PLAN_TAB_LABELS[id]}
            </Link>
          );
        })}
      </div>

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
    </div>
  );
}
