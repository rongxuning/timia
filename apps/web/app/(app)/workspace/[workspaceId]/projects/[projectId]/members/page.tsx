"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

type WorkspaceMemberRow = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  is_creator?: boolean;
};

type ProjectMember = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  is_creator?: boolean;
};

type ProjectBrief = {
  id: string;
  can_manage?: boolean;
  created_by_user_id?: string | null;
};

export default function ProjectMembersPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const { workspaceId, projectId } = params;
  const token = useMemo(() => getToken(), []);

  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberRow[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [project, setProject] = useState<ProjectBrief | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    const [wm, pm, pr] = await Promise.all([
      apiFetch<WorkspaceMemberRow[]>(`/workspaces/${workspaceId}/members`, { token }),
      apiFetch<ProjectMember[]>(`/workspaces/${workspaceId}/projects/${projectId}/members`, { token }),
      apiFetch<ProjectBrief>(`/workspaces/${workspaceId}/projects/${projectId}`, { token }),
    ]);
    setWorkspaceMembers(wm.filter((m) => m.status === "active"));
    setProjectMembers(pm.filter((m) => m.status === "active"));
    setProject(pr);
  }, [token, workspaceId, projectId]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    reload().catch((e: any) => setError(e?.message ?? "加载失败"));
  }, [router, token, reload]);

  const projectUserIds = useMemo(() => new Set(projectMembers.map((m) => m.user_id)), [projectMembers]);

  const filteredWorkspaceMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspaceMembers;
    return workspaceMembers.filter((m) => {
      const name = (m.display_name || "").toLowerCase();
      const email = (m.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [search, workspaceMembers]);

  const ownerMembersOnProject = useMemo(() => {
    const owners = projectMembers.filter((m) => m.role === "owner");
    return [...owners].sort((a, b) => {
      if (a.is_creator && !b.is_creator) return -1;
      if (!a.is_creator && b.is_creator) return 1;
      return (a.display_name || a.email).localeCompare(b.display_name || b.email);
    });
  }, [projectMembers]);

  const contributorMembers = useMemo(
    () => projectMembers.filter((m) => m.role === "member"),
    [projectMembers],
  );

  const canManageProject = project?.can_manage === true;

  async function addToProject(userId: string, role: "owner" | "member") {
    if (!token) return;
    if (!canManageProject) return;
    if (projectUserIds.has(userId)) return;
    const creatorId = project?.created_by_user_id;
    const effectiveRole: "owner" | "member" =
      creatorId && userId === creatorId ? "owner" : role;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<ProjectMember>(`/workspaces/${workspaceId}/projects/${projectId}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ user_id: userId, role: effectiveRole }),
      });
      setProjectMembers((prev) => [created, ...prev]);
    } catch (e: any) {
      setError(e?.message ?? "添加失败（需项目或空间负责人）");
    } finally {
      setSaving(false);
    }
  }

  async function setProjectMemberRole(userId: string, role: "owner" | "member") {
    if (!token) return;
    if (!canManageProject) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<ProjectMember>(`/workspaces/${workspaceId}/projects/${projectId}/members/${userId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ role }),
      });
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "更新角色失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeFromProject(userId: string) {
    if (!token) return;
    if (!canManageProject) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
        token,
      });
      setProjectMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e: any) {
      setError(e?.message ?? "移除失败（需项目或空间负责人）");
    } finally {
      setSaving(false);
    }
  }

  const allowDropMove = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  function ProjectMemberRow({
    m,
    showRoleSelect,
  }: {
    m: ProjectMember;
    showRoleSelect: boolean;
  }) {
    const isCreator =
      m.is_creator === true ||
      (!!project?.created_by_user_id && m.user_id === project.created_by_user_id);
    return (
      <li className="flex items-center justify-between gap-lg rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-sm">
        <div className="flex min-w-0 items-center gap-lg">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm font-semibold text-text-primary">
            {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-small font-semibold text-text-primary">{m.display_name || m.email}</div>
              {isCreator ? (
                <span className="shrink-0 rounded-full bg-surface-container-low px-2 py-0.5 text-overline text-primary">
                  创建人
                </span>
              ) : null}
            </div>
            <div className="truncate text-caption text-neutral-muted">{m.email}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-lg">
          {showRoleSelect && !isCreator ? (
            <select
              className="rounded-lg border border-border-subtle bg-surface-bright px-2 py-1.5 text-caption text-text-primary outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              value={m.role === "owner" ? "owner" : "member"}
              disabled={saving}
              aria-label="项目角色"
              onChange={(e) => {
                const next = e.target.value as "owner" | "member";
                if (next !== m.role) void setProjectMemberRole(m.user_id, next);
              }}
            >
              <option value="owner">负责人（owner）</option>
              <option value="member">成员（member）</option>
            </select>
          ) : null}
          {isCreator ? (
            <span className="text-caption text-neutral-muted whitespace-nowrap">不可调整</span>
          ) : null}
          {!isCreator && canManageProject ? (
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="从项目移除"
              disabled={saving}
              onClick={() => removeFromProject(m.user_id)}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <main className="px-lg py-lg">
      <div className="max-w-container-max mx-auto space-y-lg">
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-lg">
          <div className="space-y-sm">
            <div className="flex items-center gap-2">
              <h1 className="font-subhead text-subhead text-text-primary">成员</h1>
              <span className="text-small text-text-secondary">· 共 {projectMembers.length} 人</span>
            </div>
          </div>

          <div className="flex items-center gap-sm">
            <a
              className="px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center gap-2"
              href={`/workspace/${workspaceId}/projects/${projectId}`}
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              返回
            </a>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        {!canManageProject && (
          <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-lg text-small text-text-secondary">
            你当前为项目成员，仅可查看列表；添加/移除成员与调整角色需项目负责人或空间负责人操作。
          </div>
        )}

        <section className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <div className="space-y-lg overflow-hidden rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <div className="flex flex-col gap-lg sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-xs">
                <h2 className="font-subhead text-lg text-text-primary">当前工作空间成员</h2>
                <p className="text-caption text-neutral-muted">支持名字/邮箱模糊搜索；拖拽到右侧「负责人」或「成员」区域按角色加入项目。</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-neutral-muted">search</span>
                <input
                  className="w-[min(320px,80vw)] rounded-xl border border-border-subtle bg-surface-bright px-md py-sm text-small outline-none focus:ring-2 focus:ring-primary/20"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索姓名或邮箱…"
                />
              </div>
            </div>

            <ul className="space-y-sm">
              {filteredWorkspaceMembers.map((m) => {
                const added = projectUserIds.has(m.user_id);
                return (
                  <li
                    key={m.id}
                    draggable={canManageProject && !added && !saving}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", m.user_id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={[
                      "flex items-center justify-between gap-lg rounded-xl border border-border-subtle p-lg transition-all",
                      added ? "bg-surface-container-lowest opacity-50" : "bg-white hover:shadow-sm",
                    ].join(" ")}
                    title={added ? "已在项目中" : canManageProject ? "拖拽以添加" : "无权限添加成员"}
                  >
                    <div className="flex min-w-0 items-center gap-lg">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm font-semibold text-text-primary">
                        {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-small font-semibold text-text-primary">{m.display_name || m.email}</div>
                        <div className="truncate text-caption text-neutral-muted">{m.email}</div>
                      </div>
                    </div>
                    <span className="shrink-0 text-overline text-zinc-400">{added ? "已添加" : "拖拽"}</span>
                  </li>
                );
              })}
              {filteredWorkspaceMembers.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary">
                  {workspaceMembers.length === 0 ? "工作空间暂无成员。" : "没有匹配的成员。"}
                </li>
              ) : null}
            </ul>
          </div>

          <div className="space-y-lg overflow-hidden rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <div className="space-y-xs">
              <h2 className="font-subhead text-lg text-text-primary">项目成员</h2>
              <p className="text-caption text-neutral-muted">
                从左侧将工作空间成员拖到下方「负责人」或「成员」区域即可按对应角色加入项目。项目创建人固定为负责人（owner），不可降级或移除。
              </p>
            </div>

            <div className="flex flex-col gap-lg">
              <div
                className="space-y-lg rounded-xl border border-border-subtle bg-surface-container-lowest/40 p-lg"
                onDragOver={allowDropMove}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!canManageProject) return;
                  const userId = e.dataTransfer.getData("text/plain");
                  if (userId) void addToProject(userId, "owner");
                }}
              >
                <div className="flex items-center justify-between gap-lg border-b border-border-subtle pb-lg">
                  <h3 className="text-small font-semibold text-text-primary">负责人（owner）</h3>
                  <span className="text-caption text-neutral-muted">{ownerMembersOnProject.length}</span>
                </div>
                {canManageProject ? (
                  <div
                    className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-lg text-center"
                    onDragOver={allowDropMove}
                  >
                    <span className="material-symbols-outlined text-[22px] text-primary/70">person_add</span>
                    <span className="text-caption font-medium text-text-primary">拖放到此处添加为负责人</span>
                  </div>
                ) : null}
                {ownerMembersOnProject.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary"
                    onDragOver={allowDropMove}
                  >
                    暂无负责人列表。{canManageProject ? "左侧成员拖入上方虚线框即可设为 owner。" : null}
                  </div>
                ) : (
                  <ul className="space-y-sm" onDragOver={allowDropMove}>
                    {ownerMembersOnProject.map((m) => (
                      <ProjectMemberRow key={m.id} m={m} showRoleSelect={canManageProject} />
                    ))}
                  </ul>
                )}
              </div>

              <div
                className="space-y-lg rounded-xl border border-border-subtle bg-surface-container-lowest/40 p-lg"
                onDragOver={allowDropMove}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!canManageProject) return;
                  const userId = e.dataTransfer.getData("text/plain");
                  if (userId) void addToProject(userId, "member");
                }}
              >
                <div className="flex items-center justify-between gap-lg border-b border-border-subtle pb-lg">
                  <h3 className="text-small font-semibold text-text-primary">成员（member）</h3>
                  <span className="text-caption text-neutral-muted">{contributorMembers.length}</span>
                </div>
                {canManageProject ? (
                  <div
                    className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface-bright p-lg text-center"
                    onDragOver={allowDropMove}
                  >
                    <span className="material-symbols-outlined text-[22px] text-neutral-muted">person_add</span>
                    <span className="text-caption font-medium text-text-primary">拖放到此处添加为成员</span>
                  </div>
                ) : null}
                {contributorMembers.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary"
                    onDragOver={allowDropMove}
                  >
                    暂无成员列表。{canManageProject ? "左侧成员拖入上方虚线框即可加入为 member。" : null}
                  </div>
                ) : (
                  <ul className="space-y-sm" onDragOver={allowDropMove}>
                    {contributorMembers.map((m) => (
                      <ProjectMemberRow key={m.id} m={m} showRoleSelect={canManageProject} />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
