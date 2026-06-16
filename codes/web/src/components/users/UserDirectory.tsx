import type { UserDirectoryRow, UserMembershipWorkspace } from "@/types/api/views/users";

type UserDirectorySummaryProps = {
  loading: boolean;
  userTotal: number;
  usersWithWorkspace: number;
  unassignedUserCount: number;
  workspaceAssignmentsTotal: number;
};

export function UserDirectorySummary({
  loading,
  userTotal,
  usersWithWorkspace,
  unassignedUserCount,
  workspaceAssignmentsTotal,
}: UserDirectorySummaryProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg mb-lg">
      <section className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">成员</span>
        <div className="w-full min-w-0 space-y-1 text-left">
          <div className="font-subhead text-lg text-text-primary">全局用户</div>
          <div className="text-small text-text-secondary">全局用户列表，以及他们所属的工作空间。</div>
          <div className="text-caption text-neutral-muted">点击一行可展开查看工作空间与项目</div>
        </div>
      </section>

      <section className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">用户规模</span>
        <div className="flex w-full min-w-0 flex-col items-start gap-2 text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">{loading ? "—" : userTotal}</span>
            <span className="text-text-secondary text-caption">位用户</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">已加入工作空间</span>
              <span className="font-bold text-text-primary tabular-nums">{loading ? "—" : usersWithWorkspace}</span>
            </div>
            <div className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="text-caption text-neutral-muted">尚未加入</span>
              <span className="font-bold text-text-primary tabular-nums">{loading ? "—" : unassignedUserCount}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
        <span className="text-sm font-semibold text-primary">工作空间归属</span>
        <div className="flex w-full min-w-0 flex-col items-start gap-2 text-left">
          <div className="flex items-baseline gap-2">
            <span className="font-headline text-section-heading">{loading ? "—" : workspaceAssignmentsTotal}</span>
            <span className="text-text-secondary text-caption">次归属</span>
          </div>
          <div className="text-caption text-neutral-muted">每位用户在各工作空间计为 1 次；用于粗略观察组织规模。</div>
        </div>
      </section>
    </div>
  );
}

type UserDirectoryListProps = {
  loading: boolean;
  users: UserDirectoryRow[];
  expandedUserId: string | null;
  detailsByUserId: Record<string, UserMembershipWorkspace[] | undefined>;
  detailsLoadingUserId: string | null;
  detailsErrorByUserId: Record<string, string | undefined>;
  copyStateByUserId: Record<string, "idle" | "success" | "error">;
  onToggleUser: (userId: string) => void;
  onCopyEmail: (e: React.MouseEvent, userId: string, email: string) => void;
};

export function UserDirectoryList({
  loading,
  users,
  expandedUserId,
  detailsByUserId,
  detailsLoadingUserId,
  detailsErrorByUserId,
  copyStateByUserId,
  onToggleUser,
  onCopyEmail,
}: UserDirectoryListProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">加载中…</div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">暂无用户。</div>
    );
  }

  return (
    <ul className="space-y-sm">
      {users.map((u) => {
        const expanded = expandedUserId === u.id;
        const details = detailsByUserId[u.id];
        const detailsLoading = detailsLoadingUserId === u.id;
        const detailsError = detailsErrorByUserId[u.id];
        const copyState = copyStateByUserId[u.id] ?? "idle";

        return (
          <li key={u.id} className="bg-white rounded-xl border border-border-subtle p-xl hover:shadow-lg transition-all">
            <div
              role="button"
              tabIndex={0}
              className="w-full text-left cursor-pointer"
              onClick={() => onToggleUser(u.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleUser(u.id);
                }
              }}
              aria-expanded={expanded}
            >
              <div className="flex items-center justify-between gap-lg">
                <div className="min-w-0 flex items-center gap-2 text-small text-text-secondary">
                  <span className="font-subhead text-text-primary truncate">{u.display_name || u.email}</span>
                  <span className="shrink-0 text-text-secondary">·</span>
                  <span className="font-body truncate">({u.email})</span>
                  <button
                    type="button"
                    className="shrink-0 inline-flex items-center justify-center rounded-md border border-border-subtle bg-white px-2 py-1 text-text-secondary hover:text-text-primary hover:bg-gray-50 transition-colors"
                    onClick={(e) => onCopyEmail(e, u.id, u.email)}
                    aria-label={`复制邮箱 ${u.email}`}
                    title={copyState === "success" ? "已复制" : copyState === "error" ? "复制失败" : "复制邮箱"}
                  >
                    <span className="material-symbols-outlined text-[18px] leading-none">
                      {copyState === "success" ? "done" : copyState === "error" ? "error" : "content_copy"}
                    </span>
                  </button>
                  <span className="shrink-0 text-text-secondary">·</span>
                  <span className="truncate text-text-secondary">
                    创建于{" "}
                    <span className="font-semibold text-text-primary">{u.created_at_label ?? "—"}</span>
                  </span>
                  <span className="shrink-0 text-text-secondary">·</span>
                  <span className="shrink-0 text-text-secondary">
                    状态：<span className="font-semibold text-text-primary">{u.status}</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-overline uppercase tracking-widest">
                    {u.workspace_count} 个工作空间
                  </span>
                  <span className="material-symbols-outlined text-indigo-600">
                    {expanded ? "expand_less" : "expand_more"}
                  </span>
                </div>
              </div>
            </div>

            {expanded && (
              <div className="mt-lg border-t border-gray-50 pt-lg space-y-md">
                {detailsLoading && (
                  <div className="text-small text-text-secondary flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                    加载中...
                  </div>
                )}
                {detailsError && (
                  <div className="text-small text-error rounded-xl border border-error-container bg-error-container/10 p-3">
                    {detailsError}
                  </div>
                )}

                {!detailsLoading && !detailsError && details && details.length === 0 && (
                  <div className="text-small text-text-secondary">暂无 workspace 归属。</div>
                )}

                {!detailsLoading && !detailsError && details && details.length > 0 && (
                  <div className="space-y-sm">
                    {details.map((d) => (
                      <div key={d.membership_id} className="rounded-xl border border-border-subtle p-lg">
                        <div className="flex items-start justify-between gap-lg">
                          <div className="space-y-1">
                            <div className="font-subhead text-base text-text-primary">{d.workspace_name}</div>
                            <div className="text-small text-text-secondary">
                              角色：<span className="font-semibold text-text-primary">{d.role}</span> · 状态：{" "}
                              <span className="font-semibold text-text-primary">{d.status}</span>
                            </div>
                          </div>
                          <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-overline uppercase tracking-widest">
                            {d.project_count} 个项目
                          </span>
                        </div>

                        {d.projects.length > 0 && (
                          <ul className="mt-md space-y-2">
                            {d.projects.map((p) => (
                              <li key={p.id} className="flex items-center justify-between gap-3 text-small">
                                <div className="text-text-primary truncate">{p.name}</div>
                                {p.archived && (
                                  <span className="text-[11px] font-semibold text-text-secondary bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                                    已归档
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
