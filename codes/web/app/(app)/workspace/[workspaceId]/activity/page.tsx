"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ActivitySummaryCards, ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { fetchWorkspaceActivity } from "@/lib/api/workspace-views";
import { getToken } from "@/lib/auth";
import type { WorkspaceActivityView } from "@/types/api/views/activity";

export default function ActivityPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const token = useMemo(() => getToken(), []);

  const [view, setView] = useState<WorkspaceActivityView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    fetchWorkspaceActivity(token, workspaceId)
      .then((data) => {
        setView(data);
        primeWorkspaceNameForBreadcrumb(data.workspace_id, data.name);
      })
      .catch((e: { message?: string }) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [router, workspaceId, token]);

  return (
    <main className="pt-4 pb-12 px-container-padding">
      <div className="max-w-container-max mx-auto space-y-3xl">
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-lg">
          <div className="space-y-sm min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h1 className="font-subhead text-subhead text-text-primary">活动记录</h1>
              <span className="text-small text-text-secondary">· 共 {loading ? "—" : view?.total_count ?? 0} 条</span>
              {view?.name && (
                <span className="text-small text-text-secondary truncate">
                  · <span className="font-medium text-text-primary">{view.name}</span>
                  {view.description ? ` · ${view.description}` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-sm shrink-0">
            <a
              className="px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center gap-2"
              href={`/workspace/${workspaceId}`}
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              返回工作空间
            </a>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {error}
          </div>
        )}

        <ActivitySummaryCards
          loading={loading}
          totalCount={view?.total_count ?? 0}
          latestAtLabel={view?.latest_at_label}
        />

        <section className="space-y-lg">
          <div className="flex items-center justify-between gap-lg">
            <h2 className="font-subhead text-subhead text-text-primary">时间线</h2>
          </div>
          <ActivityTimeline loading={loading} items={view?.items ?? []} />
        </section>
      </div>
    </main>
  );
}
