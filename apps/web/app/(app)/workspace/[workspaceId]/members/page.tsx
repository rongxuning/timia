"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";

type Workspace = { id: string; name: string; description?: string | null; created_by_user_id?: string | null };
type Me = { id: string };
type WorkspaceMember = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  is_creator?: boolean;
};

type SystemUser = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  workspace_count?: number;
  created_at?: string;
};

export default function MembersPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const token = useMemo(() => getToken(), []);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManageWorkspace = useMemo(() => {
    if (!me?.id) return false;
    const row = workspaceMembers.find((m) => m.user_id === me.id && m.status === "active");
    return row?.role === "owner";
  }, [me, workspaceMembers]);

  const reload = useCallback(async () => {
    if (!token) return;
    const [m, u, meRes] = await Promise.all([
      apiFetch<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`, { token }),
      apiFetch<SystemUser[]>("/users", { token }).catch(() => [] as SystemUser[]),
      apiFetch<Me>("/auth/me", { token }).catch(() => null as any),
    ]);
    setWorkspaceMembers(m.filter((x) => x.status === "active"));
    setSystemUsers((u ?? []).filter((x) => x.status === "active"));
    setMe(meRes);
  }, [token, workspaceId]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    Promise.all([
      apiFetch<Workspace>(`/workspaces/${workspaceId}`, { token })
        .then((w) => {
          setWorkspace(w);
          primeWorkspaceNameForBreadcrumb(w.id, w.name);
        })
        .catch(() => setWorkspace(null)),
      reload(),
    ]).catch((e: any) => setError(e?.message ?? "加载失败"));
  }, [router, token, workspaceId, reload]);

  const memberUserIds = useMemo(() => new Set(workspaceMembers.map((m) => m.user_id)), [workspaceMembers]);

  const filteredSystemUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return systemUsers;
    return systemUsers.filter((u) => {
      const name = (u.display_name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [search, systemUsers]);

  const owners = useMemo(() => workspaceMembers.filter((m) => m.role === "owner"), [workspaceMembers]);
  const members = useMemo(() => workspaceMembers.filter((m) => m.role === "member"), [workspaceMembers]);

  async function addToWorkspace(userId: string, role: "owner" | "member") {
    if (!token) return;
    if (!canManageWorkspace) return;
    if (memberUserIds.has(userId)) return;
    const creatorId = workspace?.created_by_user_id;
    const effectiveRole: "owner" | "member" =
      creatorId && userId === creatorId ? "owner" : role;
    const u = systemUsers.find((x) => x.id === userId);
    if (!u?.email) return;
    setSaving(true);
    setError(null);
    try {
      const created = await apiFetch<WorkspaceMember>(`/workspaces/${workspaceId}/members`, {
        method: "POST",
        token,
        body: JSON.stringify({ email: u.email, role: effectiveRole }),
      });
      setWorkspaceMembers((prev) => [created, ...prev]);
    } catch (e: any) {
      setError(e?.message ?? "添加失败（需空间负责人 owner）");
    } finally {
      setSaving(false);
    }
  }

  async function setWorkspaceMemberRole(memberId: string, role: "owner" | "member") {
    if (!token) return;
    if (!canManageWorkspace) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<WorkspaceMember>(`/workspaces/${workspaceId}/members/${memberId}`, {
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

  async function removeFromWorkspace(memberId: string) {
    if (!token) return;
    if (!canManageWorkspace) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/members/${memberId}`, {
        method: "DELETE",
        token,
      });
      setWorkspaceMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (e: any) {
      setError(e?.message ?? "移除失败（需空间负责人 owner）");
    } finally {
      setSaving(false);
    }
  }

  const allowDropMove = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  function MemberRow({
    m,
    showRoleSelect,
  }: {
    m: WorkspaceMember;
    showRoleSelect: boolean;
  }) {
    const isCreator =
      m.is_creator === true ||
      (!!workspace?.created_by_user_id && m.user_id === workspace.created_by_user_id);
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
              aria-label="空间角色"
              onChange={(e) => {
                const next = e.target.value as "owner" | "member";
                if (next !== m.role) void setWorkspaceMemberRole(m.id, next);
              }}
            >
              <option value="owner">负责人（owner）</option>
              <option value="member">成员（member）</option>
            </select>
          ) : null}
          {isCreator ? (
            <span className="text-caption text-neutral-muted whitespace-nowrap">不可调整</span>
          ) : null}
          {!isCreator && canManageWorkspace ? (
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              title="从空间移除"
              disabled={saving}
              onClick={() => removeFromWorkspace(m.id)}
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
              <span className="text-small text-text-secondary">· 共 {workspaceMembers.length} 人</span>
            </div>
          </div>

          <div className="flex items-center gap-sm">
            <a
              className="px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center gap-2"
              href={`/workspace/${workspaceId}`}
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

        {!canManageWorkspace && (
          <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-lg text-small text-text-secondary">
            你当前为工作空间成员，仅可查看列表；添加/移除成员与调整角色需空间负责人（owner）操作。
          </div>
        )}

        <section className="grid grid-cols-1 gap-lg lg:grid-cols-2">
          <div className="space-y-lg overflow-hidden rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <div className="flex flex-col gap-lg sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-xs">
                <h2 className="font-subhead text-lg text-text-primary">系统所有成员</h2>
                <p className="text-caption text-neutral-muted">支持名字/邮箱模糊搜索；拖拽到右侧分组即可添加。</p>
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
              {filteredSystemUsers.map((u) => {
                const added = memberUserIds.has(u.id);
                return (
                  <li
                    key={u.id}
                    draggable={canManageWorkspace && !added && !saving}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", u.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={[
                      "flex items-center justify-between gap-lg rounded-xl border border-border-subtle p-lg transition-all",
                      added ? "bg-surface-container-lowest opacity-50" : "bg-white hover:shadow-sm",
                    ].join(" ")}
                    title={added ? "已在工作空间中" : canManageWorkspace ? "拖拽以添加" : "无权限添加成员"}
                  >
                    <div className="flex min-w-0 items-center gap-lg">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container text-sm font-semibold text-text-primary">
                        {(u.display_name?.trim().slice(0, 1) || u.email.trim().slice(0, 1)).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-small font-semibold text-text-primary">{u.display_name || u.email}</div>
                        <div className="truncate text-caption text-neutral-muted">{u.email}</div>
                      </div>
                    </div>
                    <span className="shrink-0 text-overline text-zinc-400">{added ? "已添加" : "拖拽"}</span>
                  </li>
                );
              })}
              {filteredSystemUsers.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary">
                  没有匹配的用户。
                </li>
              ) : null}
            </ul>
          </div>

          <div className="space-y-lg overflow-hidden rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <div className="space-y-xs">
              <h2 className="font-subhead text-lg text-text-primary">工作空间成员</h2>
              <p className="text-caption text-neutral-muted">
                从左侧将用户拖到下方「负责人」或「成员」区域即可按对应角色加入。
              </p>
            </div>

            <div className="flex flex-col gap-lg">
              <div
                className="space-y-lg rounded-xl border border-border-subtle bg-surface-container-lowest/40 p-lg"
                onDragOver={allowDropMove}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!canManageWorkspace) return;
                  const userId = e.dataTransfer.getData("text/plain");
                  if (userId) void addToWorkspace(userId, "owner");
                }}
              >
                <div className="flex items-center justify-between gap-lg border-b border-border-subtle pb-lg">
                  <h3 className="text-small font-semibold text-text-primary">负责人（owner）</h3>
                  <span className="text-caption text-neutral-muted">{owners.length}</span>
                </div>
                {canManageWorkspace ? (
                  <div
                    className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-lg text-center"
                    onDragOver={allowDropMove}
                  >
                    <span className="material-symbols-outlined text-[22px] text-primary/70">person_add</span>
                    <span className="text-caption font-medium text-text-primary">拖放到此处添加为负责人</span>
                  </div>
                ) : null}
                {owners.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary"
                    onDragOver={allowDropMove}
                  >
                    暂无负责人列表。{canManageWorkspace ? "左侧用户拖入上方虚线框即可设为 owner。" : null}
                  </div>
                ) : (
                  <ul className="space-y-sm" onDragOver={allowDropMove}>
                    {owners.map((m) => (
                      <MemberRow key={m.id} m={m} showRoleSelect={canManageWorkspace} />
                    ))}
                  </ul>
                )}
              </div>

              <div
                className="space-y-lg rounded-xl border border-border-subtle bg-surface-container-lowest/40 p-lg"
                onDragOver={allowDropMove}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!canManageWorkspace) return;
                  const userId = e.dataTransfer.getData("text/plain");
                  if (userId) void addToWorkspace(userId, "member");
                }}
              >
                <div className="flex items-center justify-between gap-lg border-b border-border-subtle pb-lg">
                  <h3 className="text-small font-semibold text-text-primary">成员（member）</h3>
                  <span className="text-caption text-neutral-muted">{members.length}</span>
                </div>
                {canManageWorkspace ? (
                  <div
                    className="flex min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface-bright p-lg text-center"
                    onDragOver={allowDropMove}
                  >
                    <span className="material-symbols-outlined text-[22px] text-neutral-muted">person_add</span>
                    <span className="text-caption font-medium text-text-primary">拖放到此处添加为成员</span>
                  </div>
                ) : null}
                {members.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed border-border-subtle p-lg text-small text-text-secondary"
                    onDragOver={allowDropMove}
                  >
                    暂无成员列表。{canManageWorkspace ? "左侧用户拖入上方虚线框即可加入为 member。" : null}
                  </div>
                ) : (
                  <ul className="space-y-sm" onDragOver={allowDropMove}>
                    {members.map((m) => (
                      <MemberRow key={m.id} m={m} showRoleSelect={canManageWorkspace} />
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

