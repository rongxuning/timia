"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageMain } from "@/components/layout";
import { PlanList } from "@/components/plans/PlanList";
import {
  parsePlanFilters,
  parsePlanTab,
  planListHref,
  type PlanFilterValues,
} from "@/components/plans/PlanFilters";
import { fetchPlanList, type FetchPlanListParams, type PlanCardOut } from "@/lib/api/plans";
import { getToken } from "@/lib/auth";

function PlansPageFallback() {
  return (
    <PageMain className="!px-3" fullWidth>
      <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
        加载中…
      </div>
    </PageMain>
  );
}

function PlansPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const tab = parsePlanTab(searchParams.get("tab"));
  const filters = useMemo(() => parsePlanFilters(new URLSearchParams(searchKey)), [searchKey]);
  const [items, setItems] = useState<PlanCardOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params: FetchPlanListParams = {
      tab,
      q: filters.q.trim() || undefined,
      creator_q: filters.creator_q.trim() || undefined,
      period_kind: filters.period_kind || undefined,
      usage_kind: filters.usage_kind || undefined,
      tag: filters.tags.length > 0 ? filters.tags : undefined,
      limit: 50,
    };
    if (tab === "created" && filters.visibility) {
      params.visibility = filters.visibility;
    }
    fetchPlanList(token, params)
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setError(e?.message ?? "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, tab, filters]);

  const onFiltersChange = useCallback(
    (next: PlanFilterValues) => {
      router.replace(planListHref(tab, next), { scroll: false });
    },
    [router, tab],
  );

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="space-y-lg">
        <div>
          <h1 className="font-subhead text-subhead text-text-primary">规划</h1>
          <p className="mt-1 text-small text-text-secondary">发现公开模板，或查看你创建、导入和订阅的规划</p>
        </div>

        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        <PlanList
          tab={tab}
          filters={filters}
          items={items}
          loading={loading}
          onFiltersChange={onFiltersChange}
        />
      </div>
    </PageMain>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<PlansPageFallback />}>
      <PlansPageInner />
    </Suspense>
  );
}
