"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { LabelColorPicker } from "@/components/LabelColorPicker";
import { ModalDialog } from "@/components/ModalDialog";
import { ProjectList, RecentDiscussions, WorkspaceDashboardCards } from "@/components/workspace";
import { primeProjectNameForBreadcrumb, primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { TaskDrawerWithComments } from "@/components/TaskDrawerWithComments";
import { ProjectModal } from "@/components/ProjectModal";
import { fetchWorkspaceDashboard, updateProjectFavorite } from "@/lib/api/workspace-views";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { favoriteCardsFirst } from "@/lib/cardSort";
import type { DiscussionViewItem, WorkspaceDashboardView, WorkspaceProjectCard } from "@/types/api/views/workspace";

type WorkspacePatch = { id: string; name: string; description?: string | null; color: string };

export default function WorkspaceHome() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const editWorkspaceDialogTitleId = useId();
  const deleteProjectDialogTitleId = useId();

  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dashboard, setDashboard] = useState<WorkspaceDashboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<WorkspaceProjectCard | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerProjectId, setTaskDrawerProjectId] = useState<string | null>(null);
  const [taskDrawerItemId, setTaskDrawerItemId] = useState<string | null>(null);
  const [taskDrawerHighlightId, setTaskDrawerHighlightId] = useState<string | null>(null);
  const [editWorkspaceOpen, setEditWorkspaceOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState("#FFFFFF");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editProjectTarget, setEditProjectTarget] = useState<WorkspaceProjectCard | null>(null);
  const [favoritingProjectId, setFavoritingProjectId] = useState<string | null>(null);

  const reloadDashboard = useCallback(async () => {
    const t = getToken();
    if (!t) return;
    const data = await fetchWorkspaceDashboard(t, workspaceId);
    setDashboard(data);
    primeWorkspaceNameForBreadcrumb(data.workspace_id, data.name);
    for (const p of data.active_projects) {
      primeProjectNameForBreadcrumb(workspaceId, p.id, p.name);
    }
  }, [workspaceId]);

  useEffect(() => {
    const t = getToken();
    setToken(t);
    setAuthReady(true);
    if (!t) {
      router.push("/login");
      return;
    }
    setError(null);
    reloadDashboard().catch((e: { message?: string }) => setError(e?.message ?? "加载失败"));
  }, [router, reloadDashboard]);

  function openEditWorkspaceModal() {
    if (!dashboard?.can_edit_workspace) return;
    setEditName(dashboard.name);
    setEditDescription(dashboard.description ?? "");
    setEditColor(dashboard.color || "#FFFFFF");
    setEditError(null);
    setEditWorkspaceOpen(true);
  }

  async function onSaveWorkspaceDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const name = editName.trim();
    const description = editDescription.trim();
    if (!name) {
      setEditError("请输入工作空间名称");
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      await apiFetch<WorkspacePatch>(`/workspaces/${workspaceId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ name, description: description || null, color: editColor }),
      });
      setEditWorkspaceOpen(false);
      await reloadDashboard();
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "保存失败";
      setEditError(msg);
    } finally {
      setEditLoading(false);
    }
  }

  async function onDeleteProject(project: WorkspaceProjectCard) {
    if (!token) return;
    setDeleteProjectError(null);
    setDeletingProjectId(project.id);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/projects/${project.id}`, { method: "DELETE", token });
      setDeleteProjectOpen(false);
      setDeleteProjectTarget(null);
      await reloadDashboard();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "删除失败";
      setDeleteProjectError(msg);
    } finally {
      setDeletingProjectId(null);
    }
  }

  async function onToggleProjectFavorite(project: WorkspaceProjectCard) {
    if (!token || favoritingProjectId) return;
    const next = !project.is_favorite;
    setFavoritingProjectId(project.id);
    setDashboard((current) =>
      current
        ? {
            ...current,
            active_projects: favoriteCardsFirst(
              current.active_projects.map((p) =>
                p.id === project.id ? { ...p, is_favorite: next } : p,
              ),
            ),
          }
        : current,
    );
    try {
      await updateProjectFavorite(token, workspaceId, project.id, next);
    } catch (e: unknown) {
      setDashboard((current) =>
        current
          ? {
              ...current,
              active_projects: favoriteCardsFirst(
                current.active_projects.map((p) =>
                  p.id === project.id ? { ...p, is_favorite: !next } : p,
                ),
              ),
            }
          : current,
      );
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "收藏操作失败";
      setError(msg);
    } finally {
      setFavoritingProjectId(null);
    }
  }

  function openTaskFromDiscussion(row: DiscussionViewItem) {
    setTaskDrawerProjectId(row.project_id);
    setTaskDrawerItemId(row.item_id);
    setTaskDrawerHighlightId(row.id);
    setTaskDrawerOpen(true);
  }

  if (!authReady) {
    return (
      <PageMain className="!px-3" fullWidth>
        <div className="grid items-start gap-lg lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="self-start lg:sticky lg:top-lg">
            <WorkspaceDashboardCards dashboard={null} workspaceId={workspaceId} />
          </aside>
          <div className="min-w-0">
            <ProjectList workspaceId={workspaceId} projects={[]} canCreateProject={false} />
          </div>
        </div>
      </PageMain>
    );
  }

  if (!token) return null;

  return (
    <PageMain className="!px-3" fullWidth>
      {error && (
        <div className="mb-lg rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {error}
        </div>
      )}

      <div className="grid items-start gap-lg lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside id="workspace-status-panel" className="self-start lg:sticky lg:top-lg">
          <WorkspaceDashboardCards
            dashboard={dashboard}
            workspaceId={workspaceId}
            onEditWorkspace={openEditWorkspaceModal}
          />
        </aside>

        <div className="min-w-0 space-y-2xl">
          <ProjectList
            workspaceId={workspaceId}
            projects={dashboard?.active_projects ?? []}
            canCreateProject={dashboard?.can_edit_workspace ?? false}
            onCreateProject={() => setCreateProjectOpen(true)}
            deletingProjectId={deletingProjectId}
            favoritingProjectId={favoritingProjectId}
            onFavoriteProject={onToggleProjectFavorite}
            onEditProject={setEditProjectTarget}
            onDeleteProject={(p) => {
              setDeleteProjectError(null);
              setDeleteProjectTarget(p);
              setDeleteProjectOpen(true);
            }}
          />

          <RecentDiscussions token={token} workspaceId={workspaceId} onOpenTask={openTaskFromDiscussion} />
        </div>
      </div>

      <ProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        workspaceId={workspaceId}
        token={token}
        mode="create"
        onSuccess={() => void reloadDashboard()}
      />

      <ProjectModal
        open={!!editProjectTarget}
        onClose={() => setEditProjectTarget(null)}
        workspaceId={workspaceId}
        token={token}
        mode="edit"
        projectId={editProjectTarget?.id}
        initialName={editProjectTarget?.name ?? ""}
        initialDescription={editProjectTarget?.description}
        initialColor={editProjectTarget?.color ?? "#FFFFFF"}
        onSuccess={() => {
          setEditProjectTarget(null);
          void reloadDashboard();
        }}
      />

      {editWorkspaceOpen ? (
        <ModalDialog
          titleId={editWorkspaceDialogTitleId}
          onClose={() => setEditWorkspaceOpen(false)}
          busy={editLoading}
          className="w-[min(720px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] space-y-5 overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-sm"
        >
          {({ requestClose }) => (
            <>
              <div className="flex items-center justify-between">
                <div id={editWorkspaceDialogTitleId} className="font-semibold font-subhead">
                  编辑工作空间
                </div>
                <button
                  type="button"
                  className="text-sm underline disabled:opacity-50"
                  disabled={editLoading}
                  onClick={requestClose}
                >
                  关闭
                </button>
              </div>
              <form onSubmit={onSaveWorkspaceDetails} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="editWorkspaceName">
                    名称
                  </label>
                  <input
                    id="editWorkspaceName"
                    className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={editLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="editWorkspaceDescription">
                    描述
                  </label>
                  <textarea
                    id="editWorkspaceDescription"
                    className="min-h-[96px] w-full resize-none rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    disabled={editLoading}
                  />
                </div>
                <LabelColorPicker value={editColor} onChange={setEditColor} disabled={editLoading} />
                {editError ? <div className="text-small text-error">{editError}</div> : null}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-50"
                    onClick={requestClose}
                    disabled={editLoading}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"
                    disabled={editLoading}
                  >
                    {editLoading ? "保存中…" : "保存"}
                  </button>
                </div>
              </form>
            </>
          )}
        </ModalDialog>
      ) : null}

      <TaskDrawerWithComments
        open={taskDrawerOpen}
        onClose={() => {
          setTaskDrawerOpen(false);
          setTaskDrawerProjectId(null);
          setTaskDrawerItemId(null);
          setTaskDrawerHighlightId(null);
        }}
        workspaceId={workspaceId}
        projectId={taskDrawerProjectId ?? ""}
        itemId={taskDrawerItemId}
        highlightCommentId={taskDrawerHighlightId}
        token={token}
      />

      {deleteProjectOpen && deleteProjectTarget ? (
        <ModalDialog
          titleId={deleteProjectDialogTitleId}
          onClose={() => setDeleteProjectOpen(false)}
          busy={!!deletingProjectId}
          className="w-[min(720px,calc(100vw-2rem))] space-y-5 rounded-xl border border-border-subtle bg-surface p-6 shadow-sm"
        >
          {({ requestClose }) => (
            <>
              <div id={deleteProjectDialogTitleId} className="font-semibold font-subhead">
                删除项目
              </div>
              <div className="rounded-xl border border-error-container bg-error-container/10 p-4">
                <div className="font-medium">确定要删除项目 “{deleteProjectTarget.name}” 吗？</div>
              </div>
              {deleteProjectError ? <div className="text-small text-error">{deleteProjectError}</div> : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-50"
                  onClick={requestClose}
                  disabled={!!deletingProjectId}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                  onClick={() => void onDeleteProject(deleteProjectTarget)}
                  disabled={deletingProjectId === deleteProjectTarget.id}
                >
                  {deletingProjectId === deleteProjectTarget.id ? "删除中…" : "删除"}
                </button>
              </div>
            </>
          )}
        </ModalDialog>
      ) : null}
    </PageMain>
  );
}
