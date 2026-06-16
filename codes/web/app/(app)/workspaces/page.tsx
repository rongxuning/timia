"use client";

import { useEffect, useState } from "react";
import { PageMain } from "@/components/layout";
import { WorkspaceCardGrid } from "@/components/workspace";
import { primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { fetchWorkspaceCards } from "@/lib/api/workspace-views";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import type { WorkspaceCardView } from "@/types/api/views/workspace";

type Workspace = { id: string; name: string; description?: string | null };

export default function WorkspacesPage() {
  const router = useRouter();
  const [items, setItems] = useState<WorkspaceCardView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceCardView | null>(null);

  async function reloadCards() {
    const token = getToken();
    if (!token) return;
    const cards = await fetchWorkspaceCards(token);
    setItems(cards);
    for (const c of cards) primeWorkspaceNameForBreadcrumb(c.id, c.name);
  }

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    fetchWorkspaceCards(token)
      .then((cards) => {
        setItems(cards);
        for (const c of cards) primeWorkspaceNameForBreadcrumb(c.id, c.name);
      })
      .catch((e: { message?: string }) => setError(e?.message ?? "加载失败"));
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
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "创建失败";
      setCreateError(msg);
    } finally {
      setCreateLoading(false);
    }
  }

  async function onDeleteWorkspace(workspace: WorkspaceCardView) {
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
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "删除失败";
      setDeleteError(msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <PageMain className="min-h-screen">
      <button
        className="fixed bottom-6 right-6 z-40 flex items-center justify-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-xl hover:bg-primary-hover transition-all duration-200 shadow-sm active:translate-y-px"
        type="button"
        onClick={() => {
          setCreateError(null);
          setCreateOpen(true);
        }}
      >
        <span className="material-symbols-outlined">add_circle</span>
        <span className="font-medium">创建工作空间</span>
      </button>

      {error && (
        <div className="mb-lg rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {error}
        </div>
      )}
      {deleteError && (
        <div className="mb-lg rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {deleteError}
        </div>
      )}

      <WorkspaceCardGrid
        cards={items}
        deletingId={deletingId}
        onCreateClick={() => {
          setCreateError(null);
          setCreateOpen(true);
        }}
        onDeleteClick={(w) => {
          setDeleteError(null);
          setDeleteTarget(w);
          setDeleteOpen(true);
        }}
      />

      {createOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !createLoading && setCreateOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="font-semibold font-subhead">创建工作空间</div>
              <form onSubmit={onCreateWorkspace} className="space-y-4">
                <input
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="工作空间名称"
                  disabled={createLoading}
                />
                <textarea
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md min-h-[96px] resize-none"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="描述（可选）"
                  disabled={createLoading}
                />
                {createError && <div className="text-small text-error">{createError}</div>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setCreateOpen(false)} disabled={createLoading}>
                    取消
                  </button>
                  <button type="submit" className="rounded-xl bg-primary text-on-primary px-4 py-2" disabled={createLoading}>
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
          <div className="absolute inset-0 bg-black/40" onClick={() => !deletingId && setDeleteOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border p-6 space-y-4">
              <div className="font-semibold">删除工作空间 “{deleteTarget.name}”？</div>
              {deleteError && <div className="text-small text-error">{deleteError}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDeleteOpen(false)} disabled={!!deletingId}>
                  取消
                </button>
                <button type="button" className="bg-red-600 text-white px-4 py-2 rounded-xl" onClick={() => onDeleteWorkspace(deleteTarget)} disabled={deletingId === deleteTarget.id}>
                  {deletingId === deleteTarget.id ? "删除中…" : "删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageMain>
  );
}
