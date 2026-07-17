"use client";

import type { MyScheduleDashboardView } from "@/types/api/views/schedule";

export type ScheduleDashboardCardsProps = {
  dashboard: MyScheduleDashboardView | null;
};

function StatPair({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-caption text-neutral-muted">{label}</span>
      <span className={`font-bold text-lg tabular-nums ${accent ?? "text-text-primary"}`}>{value}</span>
    </div>
  );
}

export function ScheduleDashboardCards({ dashboard }: ScheduleDashboardCardsProps) {
  if (!dashboard) {
    return (
      <div className="space-y-lg">
        {[0, 1].map((i) => (
          <section
            key={i}
            className="h-48 animate-pulse rounded-xl border border-border-subtle bg-white p-lg"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-lg">
      <section className="flex flex-col items-start gap-4 rounded-xl border border-border-subtle bg-white p-lg transition-shadow hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">健康度</span>
        <div className="font-headline text-section-heading">
          {dashboard.health_percent == null ? "—" : `${dashboard.health_percent}%`}
        </div>
        <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3">
          <StatPair label="待办" value={dashboard.todo_count} />
          <StatPair label="进行中" value={dashboard.doing_count} />
          <StatPair label="已完成" value={dashboard.done_count} />
          <StatPair label="已归档" value={dashboard.archived_count} />
        </div>
        <div className="grid w-full grid-cols-1 gap-2 border-t border-border-subtle/70 pt-3 sm:grid-cols-3 lg:grid-cols-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-neutral-muted">工作空间</span>
            <span className="font-bold text-text-primary tabular-nums">{dashboard.workspace_count}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-neutral-muted">项目</span>
            <span className="font-bold text-text-primary tabular-nums">{dashboard.project_count}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption text-neutral-muted">任务总数</span>
            <span className="font-bold text-text-primary tabular-nums">{dashboard.task_total}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 rounded-xl border border-border-subtle bg-white p-lg transition-shadow hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">快速查看</span>
        <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3">
          <StatPair label="今日待办" value={dashboard.today_todo_count ?? 0} />
          <StatPair label="逾期任务" value={dashboard.overdue_count ?? 0} accent="text-red-600" />
          <StatPair label="进行中" value={dashboard.doing_count ?? 0} accent="text-indigo-600" />
          <StatPair label="本周到期" value={dashboard.due_this_week_count ?? 0} accent="text-amber-700" />
        </div>
      </section>
    </div>
  );
}
