"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { MyAnalyticsCards } from "@/components/analytics/MyAnalyticsCards";
import { fetchMyAnalytics } from "@/lib/api/analytics-views";
import { getToken } from "@/lib/auth";
import type { MyAnalyticsView } from "@/types/api/views/analytics";

export default function MyAnalyticsPage() {
  const router = useRouter();
  const token = useMemo(() => getToken(), []);
  const [analytics, setAnalytics] = useState<MyAnalyticsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    fetchMyAnalytics(token)
      .then(setAnalytics)
      .catch((e: { message?: string }) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [router, token]);

  return (
    <PageMain>
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

        <MyAnalyticsCards analytics={analytics} loading={loading} />
      </div>
    </PageMain>
  );
}
