"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { primeProjectNameForBreadcrumb, primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";

type Workspace = { id: string; name: string; description?: string | null };
type Project = { id: string; name: string; description?: string | null; archived: boolean };

export default function ProjectsPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const token = useMemo(() => getToken(), []);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [items, setItems] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    if (!token) {
      router.push("/login");
      return;
    }
    const data = await apiFetch<Project[]>(`/workspaces/${workspaceId}/projects`, { token });
    setItems(data);
    for (const p of data) {
      primeProjectNameForBreadcrumb(workspaceId, p.id, p.name);
    }
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, workspaceId]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      router.push("/login");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入项目名称");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiFetch<Project>(`/workspaces/${workspaceId}/projects`, {
        method: "POST",
        token,
        body: JSON.stringify({ name: trimmed, description: desc.trim() || null }),
      });
      setName("");
      setDesc("");
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteProject(project: Project) {
    if (!token) {
      router.push("/login");
      return;
    }
    setDeleteError(null);
    setDeletingId(project.id);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/projects/${project.id}`, { method: "DELETE", token });
      setItems((prev) => prev.filter((x) => x.id !== project.id));
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      setDeleteError(e?.message ?? "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="pt-4 pb-12 px-container-padding">
      <div className="max-w-container-max mx-auto space-y-3xl">
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-lg">
          <div className="space-y-sm">
            <div className="flex items-center gap-2">
              <h1 className="font-subhead text-subhead text-text-primary">项目</h1>
              <span className="text-small text-text-secondary">· 共 {items.length} 个</span>
            </div>
          </div>

          <div className="flex items-center gap-sm">
            <Link
              className="px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center gap-2"
              href={`/workspace/${workspaceId}`}
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              返回
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
          <div className="lg:col-span-1 bg-white rounded-xl border border-border-subtle p-xl space-y-lg">
            <div className="space-y-xs">
              <div className="font-subhead text-lg text-text-primary">新建项目</div>
              <div className="text-small text-text-secondary">为当前工作空间创建一个新项目。</div>
            </div>

            <form onSubmit={createProject} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-on-surface-variant" htmlFor="projectName">
                  项目名称
                </label>
                <input
                  id="projectName"
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：官网改版"
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-on-surface-variant" htmlFor="projectDesc">
                  描述（可选）
                </label>
                <textarea
                  id="projectDesc"
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none min-h-[96px] resize-none"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="这个项目主要做什么？"
                  disabled={saving}
                />
              </div>

              <button
                className="w-full px-lg py-sm rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover shadow-indigo-100 shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0"
                type="submit"
                disabled={saving || !name.trim()}
              >
                <span className="material-symbols-outlined text-lg">{saving ? "hourglass_top" : "add"}</span>
                {saving ? "创建中..." : "创建"}
              </button>
            </form>
          </div>

          <div className="lg:col-span-2 space-y-lg">
            <div className="flex items-center justify-between">
              <h2 className="font-subhead text-subhead text-text-primary">项目列表</h2>
            </div>

            {items.length === 0 ? (
              <div className="bg-white rounded-xl border border-border-subtle p-xl text-small text-text-secondary">
                暂无项目。先创建一个项目开始吧。
              </div>
            ) : (
              <ul className="space-y-sm">
                {items.map((p) => (
                  <li
                    key={p.id}
                    className="bg-white rounded-xl border border-border-subtle p-xl hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-lg">
                      <div className="space-y-1">
                        <div className="font-subhead text-lg text-text-primary">{p.name}</div>
                        {p.description && <div className="text-small text-text-secondary">{p.description}</div>}
                      </div>

                      <div className="flex items-center gap-sm">
                        <button
                          type="button"
                          className="w-10 h-10 flex items-center justify-center rounded-xl border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 group disabled:cursor-not-allowed disabled:opacity-50"
                          title="删除项目"
                          disabled={deletingId === p.id}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(p);
                            setDeleteOpen(true);
                          }}
                        >
                          <span className="material-symbols-outlined text-[18px] text-red-600 group-hover:text-red-700">
                            delete
                          </span>
                        </button>

                        <Link
                          className="px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center gap-2"
                          href={`/workspace/${workspaceId}/projects/${p.id}`}
                        >
                          <span className="material-symbols-outlined text-lg">open_in_new</span>
                          打开
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

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
                <div className="font-semibold font-subhead">删除项目</div>
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
                  <div className="font-medium text-gray-900">确定要删除项目 “{deleteTarget.name}” 吗？</div>
                  <div className="text-small text-text-secondary mt-2">此操作不可恢复，项目下的任务也会一并删除。</div>
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
                    onClick={() => onDeleteProject(deleteTarget)}
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

