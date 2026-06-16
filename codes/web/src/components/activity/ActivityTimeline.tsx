import type { ActivityTimelineItem } from "@/types/api/views/activity";

type ActivitySummaryCardsProps = {
  loading: boolean;
  totalCount: number;
  latestAtLabel?: string | null;
};

export function ActivitySummaryCards({ loading, totalCount, latestAtLabel }: ActivitySummaryCardsProps) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-gutter">
      <div className="p-xl bg-white rounded-xl border border-border-subtle flex flex-col justify-between min-h-[120px] hover:shadow-lg transition-all">
        <span className="text-overline text-zinc-400">事件总数</span>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="font-headline text-section-heading">{loading ? "—" : totalCount}</span>
          <span className="text-text-secondary text-caption">条</span>
        </div>
      </div>
      <div className="p-xl bg-white rounded-xl border border-border-subtle flex flex-col justify-between min-h-[120px] hover:shadow-lg transition-all">
        <span className="text-overline text-zinc-400">最近一条</span>
        <div className="space-y-1 mt-2">
          <div className="font-subhead text-lg text-text-primary truncate">
            {loading ? "—" : latestAtLabel ?? "暂无"}
          </div>
          <div className="text-caption text-neutral-muted">
            {loading ? "加载中…" : totalCount === 0 ? "尚无活动数据" : "按时间从新到旧排列"}
          </div>
        </div>
      </div>
    </section>
  );
}

type ActivityTimelineProps = {
  loading: boolean;
  items: ActivityTimelineItem[];
};

export function ActivityTimeline({ loading, items }: ActivityTimelineProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-border-subtle p-xl text-small text-text-secondary flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
        加载中…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border-subtle p-xl text-small text-text-secondary">
        暂无活动记录。在工作空间内进行项目或任务操作后，将在此显示历史。
      </div>
    );
  }

  return (
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
                <span className="text-caption text-neutral-muted font-mono">{a.created_at_label}</span>
                <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-overline shrink-0">
                  {a.entity_type_label}
                </span>
              </div>
              <div className="font-subhead text-base text-text-primary">{a.action}</div>
              <div className="text-small text-text-secondary flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-neutral-muted">对象 ID</span>
                <code className="text-caption bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-md">
                  {a.entity_id_short}
                </code>
                <span className="text-neutral-muted">·</span>
                <span className="text-neutral-muted">操作者</span>
                <code className="text-caption bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-md">
                  {a.actor_user_id_short}
                </code>
              </div>
              {a.metadata != null && Object.keys(a.metadata).length > 0 && (
                <details className="text-caption text-neutral-muted pt-1">
                  <summary className="cursor-pointer text-primary hover:underline select-none">查看元数据</summary>
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
  );
}
