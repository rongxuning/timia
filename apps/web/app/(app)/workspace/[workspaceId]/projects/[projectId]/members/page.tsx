"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Member = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  is_creator?: boolean;
};

export default function ProjectMembersPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const { workspaceId, projectId } = params;
  const token = useMemo(() => getToken(), []);

  const [workspaceMembers, setWorkspaceMembers] = useState<Member[]>([]);
  const [projectMembers, setProjectMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    const [wm, pm] = await Promise.all([
      apiFetch<Member[]>(`/workspaces/${workspaceId}/members`, { token }),
      apiFetch<Member[]>(`/workspaces/${workspaceId}/projects/${projectId}/members`, { token }),
    ]);
    setWorkspaceMembers(wm.filter((m) => m.status === "active"));
    setProjectMembers(pm.filter((m) => m.status === "active"));
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

  const adminMembers = useMemo(() => {
    const admins = projectMembers.filter((m) => m.role === "admin");
    return [...admins].sort((a, b) => {
      if (a.is_creator && !b.is_creator) return -1;
      if (!a.is_creator && b.is_creator) return 1;
      return (a.display_name || a.email).localeCompare(b.display_name || b.email);
    });
  }, [projectMembers]);

  const contributorMembers = useMemo(
    () => projectMembers.filter((m) => m.role === "member"),
    [projectMembers],
  );

  async function addToProject(userId: string) {
    if (!token) return;
    if (projectUserIds.has(userId)) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<Member>(`/workspaces/${workspaceId}/projects/${projectId}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ user_id: userId, role: "member" }),
      });
      setProjectMembers((prev) => [created, ...prev]);
    } catch (e: any) {
      setError(e?.message ?? "添加失败（需 Owner/Admin）");
    } finally {
      setSaving(false);
    }
  }

  async function setProjectMemberRole(userId: string, role: "admin" | "member") {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<Member>(`/workspaces/${workspaceId}/projects/${projectId}/members/${userId}`, {
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
    setSaving(true);
    setError(null);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/projects/${projectId}/members/${userId}`, {
        method: "DELETE",
        token,
      });
      setProjectMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e: any) {
      setError(e?.message ?? "移除失败（需 Owner/Admin）");
    } finally {
      setSaving(false);
    }
  }

  function MemberRow({
    m,
    showRoleSelect,
  }: {
    m: Member;
    showRoleSelect: boolean;
  }) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-white p-4 transition-all hover:shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm font-semibold text-text-primary">
            {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-small font-semibold text-text-primary">{m.display_name || m.email}</div>
              {m.is_creator && (
                <span className="shrink-0 rounded-full bg-surface-container-low px-2 py-0.5 text-overline text-primary">
                  创建人
                </span>
              )}
            </div>
            <div className="truncate text-caption text-neutral-muted">{m.email}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showRoleSelect && (
            <select
              className="rounded-lg border border-border-subtle bg-surface-bright px-2 py-1.5 text-caption text-text-primary outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
              value={m.role === "admin" ? "admin" : "member"}
              disabled={saving}
              aria-label="项目角色"
              onChange={(e) => {
                const next = e.target.value as "admin" | "member";
                if (next !== m.role) void setProjectMemberRole(m.user_id, next);
              }}
            >
              <option value="admin">管理员</option>
              <option value="member">贡献者</option>
            </select>
          )}
          {!m.is_creator && (
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="从项目移除"
              disabled={saving}
              onClick={() => removeFromProject(m.user_id)}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <main className="px-lg py-lg">
      <div className="mx-auto max-w-container-max space-y-2xl">
        <section className="flex items-center justify-between gap-lg">
          <div className="space-y-xs">
            <h1 className="font-subhead text-subhead text-text-primary">成员管理</h1>
            <p className="text-small text-text-secondary">从左侧拖拽到右侧即可添加成员。仅 Owner/Admin 可修改。</p>
          </div>
          <a
            className="flex items-center gap-2 rounded-xl border border-zinc-200 px-lg py-sm text-sm font-medium text-text-primary transition-all hover:bg-zinc-50"
            href={`/workspace/${workspaceId}/projects/${projectId}`}
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            返回项目
          </a>
        </section>

        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <div className="space-y-lg rounded-xl border border-border-subtle bg-white p-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-subhead text-lg text-text-primary">工作空间成员</h2>
              <span className="text-small text-text-secondary">{workspaceMembers.length}</span>
            </div>

            <ul className="space-y-sm">
              {workspaceMembers.map((m) => {
                const added = projectUserIds.has(m.user_id);
                return (
                  <li
                    key={m.id}
                    draggable={!added && !saving}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", m.user_id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={[
                      "flex items-center justify-between rounded-xl border border-border-subtle p-4 transition-all",
                      added ? "bg-surface-container-lowest opacity-50" : "bg-white hover:shadow-sm",
                    ].join(" ")}
                    title={added ? "已在项目中" : "拖拽以添加"}
                  >
                    <div className="flex min-w-0 items-center gap-3">
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
            </ul>
          </div>

          <div
            className="space-y-lg rounded-xl border border-border-subtle bg-white p-lg"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const userId = e.dataTransfer.getData("text/plain");
              if (userId) void addToProject(userId);
            }}
          >
            <div className="space-y-lg">
              <div className="space-y-sm">
                <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                  <h3 className="text-small font-semibold text-text-primary">管理员</h3>
                  <span className="text-caption text-neutral-muted">{adminMembers.length}</span>
                </div>
                {adminMembers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border-subtle p-4 text-caption text-text-secondary">
                    暂无管理员。
                  </div>
                ) : (
                  <ul className="space-y-sm">
                    {adminMembers.map((m) => (
                      <MemberRow key={m.id} m={m} showRoleSelect={!m.is_creator} />
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-sm">
                <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                  <h3 className="text-small font-semibold text-text-primary">贡献者</h3>
                  <span className="text-caption text-neutral-muted">{contributorMembers.length}</span>
                </div>
                {contributorMembers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border-subtle p-4 text-small text-text-secondary">
                    将工作空间成员拖到这里，即可作为贡献者加入该项目。
                  </div>
                ) : (
                  <ul className="space-y-sm">
                    {contributorMembers.map((m) => (
                      <MemberRow key={m.id} m={m} showRoleSelect />
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
