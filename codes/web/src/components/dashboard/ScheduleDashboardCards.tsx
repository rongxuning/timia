"use client";

import type { MyScheduleDashboardView } from "@/types/api/views/schedule";

export type ScheduleDashboardCardsProps = {
  dashboard: MyScheduleDashboardView | null;
  profileHint?: string;
};

export function ScheduleDashboardCards({ dashboard, profileHint }: ScheduleDashboardCardsProps) {
  if (!dashboard) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg mb-lg">
        {[0, 1, 2].map((i) => (
          <section
            key={i}
            className="flex h-44 flex-col rounded-xl border border-border-subtle bg-white p-lg animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg mb-lg">
      <section className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">我的日程</span>
        <div className="w-full min-w-0 space-y-1 text-left">
          <div className="font-subhead text-lg text-text-primary truncate">{dashboard.display_name}</div>
          <div className="text-small text-text-secondary truncate">{dashboard.email}</div>
          {profileHint && <div className="text-caption text-neutral-muted">{profileHint}</div>}
        </div>
      </section>

      <section className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">覆盖范围</span>
        <div className="flex w-full min-w-0 flex-col items-start gap-2 text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">{dashboard.workspace_count}</span>
            <span className="text-text-secondary text-caption">个工作空间</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">项目数</span>
              <span className="font-bold text-text-primary tabular-nums">{dashboard.project_count}</span>
            </div>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">任务总数</span>
              <span className="font-bold text-text-primary tabular-nums">{dashboard.task_total}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">健康度</span>
        <div className="flex w-full min-w-0 flex-col items-start gap-2 text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">
              {dashboard.health_percent == null ? "—" : `${dashboard.health_percent}%`}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">待办</span>
              <span className="font-bold text-lg text-text-primary tabular-nums">{dashboard.todo_count}</span>
            </div>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">进行中</span>
              <span className="font-bold text-lg text-text-primary tabular-nums">{dashboard.doing_count}</span>
            </div>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">已完成</span>
              <span className="font-bold text-lg text-text-primary tabular-nums">{dashboard.done_count}</span>
            </div>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">已归档</span>
              <span className="font-bold text-lg text-text-primary tabular-nums">{dashboard.archived_count}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
