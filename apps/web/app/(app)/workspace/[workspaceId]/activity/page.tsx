"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";

type Activity = {
  id: string;
  actor_user_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: any;
  created_at: string;
};

type Workspace = { id: string; name: string; description?: string | null };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatYmdHm(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function entityTypeLabel(entityType: string) {
  const t = entityType.trim().toLowerCase();
  const map: Record<string, string> = {
    workspace: "工作空间",
    project: "项目",
    item: "任务",
    comment: "评论",
    member: "成员",
    user: "用户",
    activity: "活动",
  };
  return map[t] ?? entityType;
}

export default function ActivityPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const token = useMemo(() => getToken(), []);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [items, setItems] = useState<Activity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<Workspace>(`/workspaces/${workspaceId}`, { token }).catch(() => null as any),
      apiFetch<Activity[]>(`/workspaces/${workspaceId}/activity`, { token }),
    ])
      .then(([w, list]) => {
        setWorkspace(w);
        if (w) primeWorkspaceNameForBreadcrumb(w.id, w.name);
        setItems(list);
      })
      .catch((e: any) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [router, workspaceId, token]);

  const latestAt = items[0]?.created_at;

  return (
    <main className="pt-4 pb-12 px-container-padding">
      <div className="max-w-container-max mx-auto space-y-3xl">
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-lg">
          <div className="space-y-sm min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h1 className="font-subhead text-subhead text-text-primary">活动记录</h1>
              <span className="text-small text-text-secondary">· 共 {items.length} 条</span>
              {workspace?.name && (
                <span className="text-small text-text-secondary truncate">
                  · <span className="font-medium text-text-primary">{workspace.name}</span>
                  {workspace.description ? ` · ${workspace.description}` : ""}
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

        <section className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
          <div className="p-xl bg-white rounded-xl border border-border-subtle flex flex-col justify-between min-h-[120px] hover:shadow-lg transition-all">
            <span className="text-overline text-zinc-400">事件总数</span>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="font-headline text-section-heading">{loading ? "—" : items.length}</span>
              <span className="text-text-secondary text-caption">条</span>
            </div>
          </div>
          <div className="p-xl bg-white rounded-xl border border-border-subtle flex flex-col justify-between min-h-[120px] hover:shadow-lg transition-all">
            <span className="text-overline text-zinc-400">最近一条</span>
            <div className="space-y-1 mt-2">
              <div className="font-subhead text-lg text-text-primary truncate">
                {loading ? "—" : latestAt ? formatYmdHm(latestAt) : "暂无"}
              </div>
              <div className="text-caption text-neutral-muted">
                {loading ? "加载中…" : items.length === 0 ? "尚无活动数据" : "按时间从新到旧排列"}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-lg">
          <div className="flex items-center justify-between gap-lg">
            <h2 className="font-subhead text-subhead text-text-primary">时间线</h2>
          </div>

          {loading ? (
            <div className="bg-white rounded-xl border border-border-subtle p-xl text-small text-text-secondary flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
              加载中…
            </div>
          ) : items.length === 0 ? (
            <div className="bg-white rounded-xl border border-border-subtle p-xl text-small text-text-secondary">
              暂无活动记录。在工作空间内进行项目或任务操作后，将在此显示历史。
            </div>
          ) : (
            <ul className="space-y-sm">
              {items.map((a) => (
                <li
                  key={a.id}
                  className="bg-white rounded-xl border border-border-subtle p-xl hover:shadow-md transition-all"
                >
                  <div className="flex gap-lg items-start">
                    <div className="h-10 w-10 rounded-full bg-surface-container flex-shrink-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-indigo-500 text-[22px]">history</span>
                    </div>
                    <div className="min-w-0 flex-1 space-y-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-caption text-neutral-muted font-mono">
                          {formatYmdHm(a.created_at)}
                        </span>
                        <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-overline shrink-0">
                          {entityTypeLabel(a.entity_type)}
                        </span>
                      </div>
                      <div className="font-subhead text-base text-text-primary">{a.action}</div>
                      <div className="text-small text-text-secondary flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-neutral-muted">对象 ID</span>
                        <code className="text-caption bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-md">
                          {a.entity_id.length > 12 ? `${a.entity_id.slice(0, 8)}…` : a.entity_id}
                        </code>
                        <span className="text-neutral-muted">·</span>
                        <span className="text-neutral-muted">操作者</span>
                        <code className="text-caption bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-md">
                          {a.actor_user_id.length > 12 ? `${a.actor_user_id.slice(0, 8)}…` : a.actor_user_id}
                        </code>
                      </div>
                      {a.metadata != null && Object.keys(a.metadata).length > 0 && (
                        <details className="text-caption text-neutral-muted pt-1">
                          <summary className="cursor-pointer text-primary hover:underline select-none">
                            查看元数据
                          </summary>
                          <pre className="mt-2 p-3 rounded-lg bg-zinc-50 border border-zinc-100 overflow-x-auto text-[11px] leading-relaxed">
                            {JSON.stringify(a.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
