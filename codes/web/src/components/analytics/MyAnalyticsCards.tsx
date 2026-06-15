import type { MyAnalyticsView } from "@/types/api/views/analytics";

type MyAnalyticsCardsProps = {
  analytics: MyAnalyticsView | null;
  loading?: boolean;
};

export function MyAnalyticsCards({ analytics, loading }: MyAnalyticsCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-4 mb-xl">
      <section className="flex min-h-36 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">任务总量</span>
        <div className="flex items-baseline gap-2">
          <span className="font-headline text-section-heading">{loading ? "—" : analytics?.task_total ?? 0}</span>
          <span className="text-caption text-text-secondary">项</span>
        </div>
        <p className="text-caption text-neutral-muted">我负责或参与的任务</p>
      </section>

      <section className="flex min-h-36 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">完成健康度</span>
        <div className="flex items-baseline gap-2">
          <span className="font-headline text-section-heading">
            {loading || analytics?.health_percent == null ? "—" : `${analytics.health_percent}%`}
          </span>
        </div>
        <p className="text-caption text-neutral-muted">
          已完成 {loading ? "—" : analytics?.done_count ?? 0} · 已归档 {loading ? "—" : analytics?.archived_count ?? 0}
        </p>
      </section>

      <section className="flex min-h-36 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">高优先级</span>
        <div className="flex items-baseline gap-2">
          <span className="font-headline text-section-heading">{loading ? "—" : analytics?.high_priority_count ?? 0}</span>
          <span className="text-caption text-text-secondary">项</span>
        </div>
        <p className="text-caption text-neutral-muted">
          待办 {loading ? "—" : analytics?.todo_count ?? 0} · 进行中 {loading ? "—" : analytics?.doing_count ?? 0}
        </p>
      </section>

      <section className="flex min-h-36 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">覆盖范围</span>
        <div className="flex items-baseline gap-2">
          <span className="font-headline text-section-heading">{loading ? "—" : analytics?.workspace_count ?? 0}</span>
          <span className="text-caption text-text-secondary">空间</span>
          <span className="text-caption text-neutral-muted">·</span>
          <span className="font-headline text-section-heading">{loading ? "—" : analytics?.project_count ?? 0}</span>
          <span className="text-caption text-text-secondary">项目</span>
        </div>
        <p className="text-caption text-neutral-muted truncate">{analytics?.display_name ?? "—"}</p>
      </section>
    </div>
  );
}
