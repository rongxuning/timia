"use client";

import Link from "next/link";
import type { WorkspaceDashboardView } from "@/types/api/views/workspace";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatYmdHm(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function MemberAvatars({ members, overflow }: { members: Array<{ id: string; display_name: string; email: string }>; overflow: number }) {
  return (
    <div className="flex -space-x-2">
      {members.map((m) => (
        <div
          key={m.id}
          className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
          title={m.display_name || m.email}
        >
          {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
          +{overflow}
        </div>
      )}
    </div>
  );
}

export type WorkspaceDashboardCardsProps = {
  dashboard: WorkspaceDashboardView | null;
  workspaceId: string;
  onEditWorkspace?: () => void;
  onCreateProject?: () => void;
};

export function WorkspaceDashboardCards({
  dashboard,
  workspaceId,
  onEditWorkspace,
  onCreateProject,
}: WorkspaceDashboardCardsProps) {
  if (!dashboard) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_2.5fr_1.5fr_2fr_2fr] items-stretch gap-lg">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="min-h-44 rounded-xl border border-border-subtle bg-white p-lg animate-pulse" />
        ))}
      </section>
    );
  }

  const { members, stats, can_edit_workspace: canEdit } = dashboard;
  const ownerOverflow = Math.max(0, members.owner_count - members.owners_preview.length);
  const memberOverflow = Math.max(0, members.member_count - members.members_preview.length);

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_2.5fr_1.5fr_2fr_2fr] items-stretch gap-lg">
      <div
        className={
          canEdit
            ? "flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            : "flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg"
        }
        role={canEdit ? "button" : undefined}
        tabIndex={canEdit ? 0 : undefined}
        aria-label={canEdit ? "编辑工作空间名称与描述" : undefined}
        onClick={canEdit ? onEditWorkspace : undefined}
        onKeyDown={
          canEdit
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEditWorkspace?.();
                }
              }
            : undefined
        }
      >
        <span className="text-sm font-semibold text-primary">工作空间</span>
        <div className="space-y-1">
          <div className="font-subhead text-lg text-text-primary truncate">{dashboard.name}</div>
          <div className="text-small text-text-secondary truncate">{dashboard.description || "暂无描述。"}</div>
          <div className="text-caption text-neutral-muted">
            创建于 {dashboard.created_at ? formatYmdHm(dashboard.created_at) : "—"}
          </div>
          <div className="text-caption text-neutral-muted">创建者 {dashboard.created_by_display_name ?? "—"}</div>
          {canEdit && <div className="text-caption text-primary pt-1">点击编辑名称与描述</div>}
        </div>
      </div>

      <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">成员</span>
        <div className="space-y-2 mt-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">{members.total}</span>
            <span className="text-text-secondary text-caption">总计</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-caption text-neutral-muted">负责人（owner）{members.owner_count}</div>
            <MemberAvatars members={members.owners_preview} overflow={ownerOverflow} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-caption text-neutral-muted">成员 {members.member_count}</div>
            <MemberAvatars members={members.members_preview} overflow={memberOverflow} />
          </div>
        </div>
      </div>

      <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">项目数量</span>
        <div className="flex items-baseline gap-2">
          <span className="font-headline text-section-heading">{stats.project_count}</span>
          <span className="text-text-secondary text-caption">个项目</span>
        </div>
      </div>

      <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">项目健康度</span>
        <div className="space-y-3 mt-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">
              {stats.health_percent == null ? "—" : `${stats.health_percent}%`}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <div className="text-caption text-neutral-muted">待办</div>
              <div className="font-bold text-lg text-text-primary">{stats.todo_count}</div>
            </div>
            <div className="space-y-1">
              <div className="text-caption text-neutral-muted">进行中</div>
              <div className="font-bold text-lg text-text-primary">{stats.doing_count}</div>
            </div>
            <div className="space-y-1">
              <div className="text-caption text-neutral-muted">高优先级</div>
              <div className="font-bold text-lg text-text-primary">{stats.high_priority_count}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">工作空间设置</span>
        <div className="grid grid-cols-1 gap-sm">
          <Link
            className="w-full px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
            href={`/workspace/${workspaceId}/members`}
          >
            <span className="material-symbols-outlined text-lg">{canEdit ? "person_add" : "group"}</span>
            {canEdit ? "成员管理" : "查看成员"}
          </Link>
          {canEdit ? (
            <button
              type="button"
              className="w-full px-lg py-sm rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover shadow-indigo-100 shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
              onClick={onCreateProject}
            >
              <span className="material-symbols-outlined text-lg">add</span>
              新建项目
            </button>
          ) : (
            <p className="text-caption text-neutral-muted px-1 py-2 text-center">
              仅空间负责人可新建项目；你可访问被加入的项目与任务。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
