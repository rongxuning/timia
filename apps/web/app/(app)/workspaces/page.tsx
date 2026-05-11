"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useRouter } from "next/navigation";

type CardUser = { id: string; email: string; display_name: string; role: string; status: string };
type WorkspaceCard = {
  id: string;
  name: string;
  description?: string | null;
  project_count: number;
  todo_count: number;
  doing_count: number;
  done_count: number;
  admins: CardUser[];
  contributors: CardUser[];
};

type Workspace = { id: string; name: string; description?: string | null };

function getInitial(name: string) {
  const s = name.trim();
  if (!s) return "?";
  return s.slice(0, 1).toUpperCase();
}

function AvatarCircle({ label, title }: { label: string; title: string }) {
  const initial = getInitial(label);
  return (
    <div
      title={title}
      className="w-8 h-8 rounded-full border-2 border-white bg-indigo-50 flex items-center justify-center text-[11px] font-bold text-indigo-700"
    >
      {initial}
    </div>
  );
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceCard | null>(null);

  async function reloadCards() {
    const token = getToken();
    if (!token) return;
    const cards = await apiFetch<WorkspaceCard[]>("/workspaces/cards", { token });
    setItems(cards);
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    apiFetch<WorkspaceCard[]>("/workspaces/cards", { token })
      .then(setItems)
      .catch((e: any) => setError(e?.message ?? "加载失败"));
  }, [router]);

  async function onCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    const name = createName.trim();
    const description = createDescription.trim();
    if (!name) {
      setCreateError("请输入工作空间名称");
      return;
    }
    setCreateError(null);
    setCreateLoading(true);
    try {
      await apiFetch<Workspace>("/workspaces", {
        method: "POST",
        token,
        body: JSON.stringify({ name, description: description || null }),
      });
      await reloadCards();
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
    } catch (err: any) {
      setCreateError(err?.message ?? "创建失败");
    } finally {
      setCreateLoading(false);
    }
  }

  async function onDeleteWorkspace(workspace: Workspace) {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    setDeleteError(null);
    setDeletingId(workspace.id);
    try {
      await apiFetch<void>(`/workspaces/${workspace.id}`, { method: "DELETE", token });
      setItems((prev) => prev.filter((w) => w.id !== workspace.id));
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.message ?? "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-[1280px] mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div />
          <button
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-xl hover:bg-primary-hover transition-all duration-200 shadow-sm active:translate-y-px"
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <span className="material-symbols-outlined">add_circle</span>
            <span className="font-medium">创建工作空间</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {error}
          </div>
        )}
        {deleteError && (
          <div className="mb-4 rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {deleteError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
          {items.map((w) => {
            const admins = w.admins ?? [];
            const contributors = w.contributors ?? [];

            return (
              <section
                key={w.id}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/workspace/${w.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") router.push(`/workspace/${w.id}`);
                }}
                className="bg-white border border-border-subtle rounded-[12px] p-6 hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer outline-none focus:ring-4 focus:ring-primary/10"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="font-subhead text-subhead text-gray-900">{w.name}</h2>
                    <p className="text-small text-text-secondary mt-1">
                      {w.description || "供团队与项目使用的协作空间。"}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-surface-container-low text-primary text-overline rounded-full uppercase tracking-widest">
                    {w.project_count} 个项目
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-6">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                    {w.todo_count ?? 0} 待办
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    {w.doing_count ?? 0} 进行中
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {w.done_count ?? 0} 已完成
                  </div>
                </div>

                <div className="space-y-4 mb-6 border-t border-gray-50 pt-4">
                  <div>
                    <span className="text-overline text-gray-400 mb-2 block">管理员</span>
                    <div className="flex -space-x-2">
                      {admins.slice(0, 2).map((m) => (
                        <AvatarCircle
                          key={m.id}
                          label={m.display_name || m.email}
                          title={`${m.display_name || m.email} (${m.email}) · ${m.role}`}
                        />
                      ))}
                      {admins.length > 2 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                          +{admins.length - 2}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-overline text-gray-400 mb-2 block">贡献者</span>
                    <div className="flex -space-x-2">
                      {contributors.slice(0, 3).map((m) => (
                        <AvatarCircle
                          key={m.id}
                          label={m.display_name || m.email}
                          title={`${m.display_name || m.email} (${m.email}) · ${m.role}`}
                        />
                      ))}
                      {contributors.length > 3 && (
                        <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                          +{contributors.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-t border-gray-50 pt-4">
                  <a
                    className="flex-1 h-10 flex items-center justify-center gap-1.5 px-3 border border-border-subtle rounded-lg text-small font-medium hover:bg-gray-50 transition-colors"
                    href={`/workspace/${w.id}/members`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                    添加成员
                  </a>
                  <a
                    className="w-10 h-10 flex items-center justify-center border border-border-subtle rounded-lg hover:bg-gray-50 transition-colors group"
                    href={`/workspace/${w.id}/activity`}
                    title="查看活动记录"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="material-symbols-outlined text-[18px] text-gray-400 group-hover:text-gray-600">
                      history
                    </span>
                  </a>
                  <button
                    type="button"
                    className="w-10 h-10 flex items-center justify-center border border-border-subtle rounded-lg hover:bg-red-50 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                    title="删除工作空间"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteError(null);
                      setDeleteTarget(w);
                      setDeleteOpen(true);
                    }}
                    disabled={deletingId === w.id}
                  >
                    <span className="material-symbols-outlined text-[18px] text-gray-400 group-hover:text-red-600">
                      delete
                    </span>
                  </button>
                </div>
              </section>
            );
          })}

          <button
            type="button"
            className="border-2 border-dashed border-gray-200 rounded-[12px] p-6 flex flex-col items-center justify-center text-center group hover:border-primary/50 transition-colors cursor-pointer min-h-[420px] h-full"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
          >
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors mb-4">
              <span className="material-symbols-outlined text-[32px]">add</span>
            </div>
            <h3 className="font-subhead text-[18px] text-gray-900">新建工作空间</h3>
            <p className="text-small text-text-secondary mt-2 max-w-[200px]">为下一个重要项目创建新的协作空间。</p>
          </button>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!createLoading) setCreateOpen(false);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="flex items-center justify-between">
                <div className="font-semibold font-subhead">创建工作空间</div>
                <button
                  className="text-sm underline"
                  type="button"
                  onClick={() => {
                    if (!createLoading) setCreateOpen(false);
                  }}
                >
                  关闭
                </button>
              </div>
              <form onSubmit={onCreateWorkspace} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="createName">
                    名称
                  </label>
                  <input
                    id="createName"
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="例如：产品团队"
                    autoFocus
                    disabled={createLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="createDescription">
                    描述
                  </label>
                  <textarea
                    id="createDescription"
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none min-h-[96px] resize-none"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    placeholder="这个工作空间主要做什么？"
                    disabled={createLoading}
                  />
                </div>
                {createError && <div className="text-small text-error">{createError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="text-sm rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-50"
                    onClick={() => setCreateOpen(false)}
                    disabled={createLoading}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="text-sm rounded-xl bg-primary text-on-primary px-4 py-2 disabled:opacity-50"
                    disabled={createLoading}
                  >
                    {createLoading ? "创建中…" : "创建"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && deleteTarget && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!deletingId) {
                setDeleteOpen(false);
                setDeleteTarget(null);
              }
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="flex items-center justify-between">
                <div className="font-semibold font-subhead">删除工作空间</div>
                <button
                  className="text-sm underline disabled:opacity-50"
                  type="button"
                  disabled={!!deletingId}
                  onClick={() => {
                    if (!deletingId) {
                      setDeleteOpen(false);
                      setDeleteTarget(null);
                    }
                  }}
                >
                  关闭
                </button>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-error-container bg-error-container/10 p-4">
                  <div className="font-medium text-gray-900">确定要删除工作空间 “{deleteTarget.name}” 吗？</div>
                  <div className="text-small text-text-secondary mt-2">
                    这会删除：空间成员关联关系、空间下的项目/任务及其评论、活动日志。此操作不可恢复。
                  </div>
                </div>

                {deleteError && <div className="text-small text-error">{deleteError}</div>}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="text-sm rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-50"
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeleteTarget(null);
                    }}
                    disabled={!!deletingId}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="text-sm rounded-xl bg-red-600 text-white px-4 py-2 hover:bg-red-700 disabled:opacity-50"
                    onClick={() => onDeleteWorkspace(deleteTarget)}
                    disabled={deletingId === deleteTarget.id}
                  >
                    {deletingId === deleteTarget.id ? "删除中…" : "删除"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

