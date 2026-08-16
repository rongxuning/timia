"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { MyAnalyticsCards } from "@/components/analytics/MyAnalyticsCards";
import { ScheduleDashboardCards } from "@/components/dashboard/ScheduleDashboardCards";
import { fetchMyAnalytics } from "@/lib/api/analytics-views";
import { fetchMyScheduleDashboard } from "@/lib/api/schedule-views";
import { getToken } from "@/lib/auth";
import type { MyAnalyticsView } from "@/types/api/views/analytics";
import type { MyScheduleDashboardView } from "@/types/api/views/schedule";

export default function MyAnalyticsPage() {
  const router = useRouter();
  const token = useMemo(() => getToken(), []);
  const [analytics, setAnalytics] = useState<MyAnalyticsView | null>(null);
  const [dashboard, setDashboard] = useState<MyScheduleDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([fetchMyAnalytics(token), fetchMyScheduleDashboard(token)])
      .then(([nextAnalytics, nextDashboard]) => {
        setAnalytics(nextAnalytics);
        setDashboard(nextDashboard);
      })
      .catch((e: { message?: string }) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [router, token]);

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="space-y-lg">
        <div>
          <h1 className="font-subhead text-subhead text-text-primary">数据分析</h1>
          <p className="mt-1 text-small text-text-secondary">基于「我的日程」任务范围的汇总指标</p>
        </div>

        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        <div className="grid items-start gap-lg lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside id="my-analytics-status-panel" className="self-start lg:sticky lg:top-lg">
            <ScheduleDashboardCards dashboard={loading ? null : dashboard} />
          </aside>
          <div className="min-w-0">
            <MyAnalyticsCards analytics={analytics} loading={loading} />
          </div>
        </div>
      </div>
    </PageMain>
  );
}
