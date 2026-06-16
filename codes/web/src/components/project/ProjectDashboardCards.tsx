import type { ProjectDashboardView } from "@/types/api/views/project";

type ProjectDashboardCardsProps = {
  dashboard: ProjectDashboardView | null;
  onEditProject?: () => void;
  onCreateTask?: () => void;
  workspaceId: string;
  projectId: string;
};

export function ProjectDashboardCards({
  dashboard,
  onEditProject,
  onCreateTask,
  workspaceId,
  projectId,
}: ProjectDashboardCardsProps) {
  const canManage = dashboard?.can_manage ?? false;

  return (
    <section className="grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-[2fr_2.5fr_2fr_2fr] items-stretch">
      <div
        className={
          canManage
            ? "flex min-h-44 cursor-pointer flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            : "flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg"
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

      <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">成员</span>
        <div className="space-y-2 mt-1.5">
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
      </div>

      <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">项目健康度</span>
        <div className="space-y-3 mt-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">
              {dashboard?.stats.health_percent == null ? "—" : `${dashboard.stats.health_percent}%`}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
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

      <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
        <span className="text-sm font-semibold text-primary">项目设置</span>
        <div className="grid grid-cols-1 gap-sm">
          <a
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-lg py-sm text-sm font-medium text-text-primary transition-all hover:bg-zinc-50"
            href={`/workspace/${workspaceId}/projects/${projectId}/members`}
          >
            <span className="material-symbols-outlined text-lg">person_add</span>
            添加成员
          </a>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-lg py-sm text-sm font-semibold text-on-primary shadow-lg shadow-indigo-100 transition-all hover:bg-primary-hover hover:-translate-y-0.5"
            type="button"
            onClick={onCreateTask}
          >
            <span className="material-symbols-outlined text-lg">add</span>
            新建任务
          </button>
        </div>
      </div>
    </section>
  );
}
