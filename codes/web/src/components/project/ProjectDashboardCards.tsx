import Link from "next/link";
import type { ProjectDashboardView } from "@/types/api/views/project";

type ProjectDashboardCardsProps = {
  dashboard: ProjectDashboardView | null;
  onEditProject?: () => void;
  workspaceId: string;
  projectId: string;
};

export function ProjectDashboardCards({
  dashboard,
  onEditProject,
  workspaceId,
  projectId,
}: ProjectDashboardCardsProps) {
  const canManage = dashboard?.can_manage ?? false;

  return (
    <section className="space-y-lg">
      <div
        className={
          canManage
            ? "flex cursor-pointer flex-col gap-4 rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            : "flex flex-col gap-4 rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg"
        }
        role={canManage ? "button" : undefined}
        tabIndex={canManage ? 0 : undefined}
        aria-label={canManage ? "编辑项目名称与描述" : undefined}
        onClick={canManage ? onEditProject : undefined}
        onKeyDown={
          canManage
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onEditProject?.();
                }
              }
            : undefined
        }
      >
        <span className="text-sm font-semibold text-primary">项目</span>
        <div className="space-y-1">
          <div className="font-subhead text-lg text-text-primary truncate">{dashboard?.name ?? "—"}</div>
          <div className="text-small text-text-secondary truncate">{dashboard?.description || "暂无描述。"}</div>
          <div className="text-caption text-neutral-muted">创建于 {dashboard?.created_at_label ?? "—"}</div>
          <div className="text-caption text-neutral-muted">创建者 {dashboard?.created_by_display_name ?? "—"}</div>
        </div>
      </div>

      <Link
        href={`/workspace/${workspaceId}/projects/${projectId}/members`}
        className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        aria-label="进入项目成员管理并添加成员"
      >
        <span className="text-sm font-semibold text-primary">成员</span>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">{dashboard?.members.total ?? "—"}</span>
            <span className="text-text-secondary text-caption">总计</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-caption text-neutral-muted">
              负责人（owner）{dashboard?.members.owner_count ?? "—"}
            </div>
            <div className="flex -space-x-2">
              {(dashboard?.members.owners_preview ?? []).map((m) => (
                <div
                  key={m.user_id}
                  className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                  title={m.display_name || m.email}
                >
                  {m.initial}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-caption text-neutral-muted">成员 {dashboard?.members.member_count ?? "—"}</div>
            <div className="flex -space-x-2">
              {(dashboard?.members.members_preview ?? []).map((m) => (
                <div
                  key={m.user_id}
                  className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                  title={m.display_name || m.email}
                >
                  {m.initial}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">项目健康度</span>
        <div className="space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">
              {dashboard?.stats.health_percent == null ? "—" : `${dashboard.stats.health_percent}%`}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">待办</span>
              <span className="font-bold text-lg text-text-primary tabular-nums">{dashboard?.stats.todo_count ?? "—"}</span>
            </div>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">进行中</span>
              <span className="font-bold text-lg text-text-primary tabular-nums">{dashboard?.stats.doing_count ?? "—"}</span>
            </div>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">已完成</span>
              <span className="font-bold text-lg text-text-primary tabular-nums">{dashboard?.stats.done_count ?? "—"}</span>
            </div>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">已归档</span>
              <span className="font-bold text-lg text-text-primary tabular-nums">
                {dashboard?.stats.archived_count ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
