"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { ProjectList, RecentDiscussions, WorkspaceDashboardCards } from "@/components/workspace";
import { primeProjectNameForBreadcrumb, primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { TaskDrawerWithComments } from "@/components/TaskDrawerWithComments";
import { ProjectModal } from "@/components/ProjectModal";
import { fetchWorkspaceDashboard } from "@/lib/api/workspace-views";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { DiscussionViewItem, WorkspaceDashboardView, WorkspaceProjectCard } from "@/types/api/views/workspace";

type WorkspacePatch = { id: string; name: string; description?: string | null };

export default function WorkspaceHome() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const token = useMemo(() => getToken(), []);

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
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const reloadDashboard = useCallback(async () => {
    if (!token) return;
    const data = await fetchWorkspaceDashboard(token, workspaceId);
    setDashboard(data);
    primeWorkspaceNameForBreadcrumb(data.workspace_id, data.name);
    for (const p of data.active_projects) {
      primeProjectNameForBreadcrumb(workspaceId, p.id, p.name);
    }
  }, [token, workspaceId]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    reloadDashboard().catch((e: { message?: string }) => setError(e?.message ?? "加载失败"));
  }, [router, token, reloadDashboard]);

  function openEditWorkspaceModal() {
    if (!dashboard?.can_edit_workspace) return;
    setEditName(dashboard.name);
    setEditDescription(dashboard.description ?? "");
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
        body: JSON.stringify({ name, description: description || null }),
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

  function openTaskFromDiscussion(row: DiscussionViewItem) {
    setTaskDrawerProjectId(row.project_id);
    setTaskDrawerItemId(row.item_id);
    setTaskDrawerHighlightId(row.id);
    setTaskDrawerOpen(true);
  }

  if (!token) return null;

  return (
    <PageMain>
      <div className="space-y-2xl">
        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        <WorkspaceDashboardCards
          dashboard={dashboard}
          workspaceId={workspaceId}
          onEditWorkspace={openEditWorkspaceModal}
          onCreateProject={() => setCreateProjectOpen(true)}
        />

        <ProjectList
          workspaceId={workspaceId}
          projects={dashboard?.active_projects ?? []}
          canCreateProject={dashboard?.can_edit_workspace ?? false}
          deletingProjectId={deletingProjectId}
          onDeleteProject={(p) => {
            setDeleteProjectError(null);
            setDeleteProjectTarget(p);
            setDeleteProjectOpen(true);
          }}
        />

        <RecentDiscussions token={token} workspaceId={workspaceId} onOpenTask={openTaskFromDiscussion} />
      </div>

      <ProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        workspaceId={workspaceId}
        token={token}
        mode="create"
        onSuccess={() => void reloadDashboard()}
      />

      {editWorkspaceOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !editLoading && setEditWorkspaceOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="flex items-center justify-between">
                <div className="font-semibold font-subhead">编辑工作空间</div>
                <button type="button" className="text-sm underline" disabled={editLoading} onClick={() => setEditWorkspaceOpen(false)}>
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
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none"
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
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none min-h-[96px] resize-none"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    disabled={editLoading}
                  />
                </div>
                {editError && <div className="text-small text-error">{editError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button type="button" className="text-sm rounded-xl border border-border-subtle px-4 py-2" onClick={() => setEditWorkspaceOpen(false)} disabled={editLoading}>
                    取消
                  </button>
                  <button type="submit" className="text-sm rounded-xl bg-primary text-on-primary px-4 py-2 disabled:opacity-50" disabled={editLoading}>
                    {editLoading ? "保存中…" : "保存"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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

      {deleteProjectOpen && deleteProjectTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deletingProjectId && setDeleteProjectOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm">
              <div className="font-semibold font-subhead">删除项目</div>
              <div className="rounded-xl border border-error-container bg-error-container/10 p-4">
                <div className="font-medium">确定要删除项目 “{deleteProjectTarget.name}” 吗？</div>
              </div>
              {deleteProjectError && <div className="text-small text-error">{deleteProjectError}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" className="text-sm rounded-xl border px-4 py-2" onClick={() => setDeleteProjectOpen(false)} disabled={!!deletingProjectId}>
                  取消
                </button>
                <button type="button" className="text-sm rounded-xl bg-red-600 text-white px-4 py-2" onClick={() => onDeleteProject(deleteProjectTarget)} disabled={deletingProjectId === deleteProjectTarget.id}>
                  {deletingProjectId === deleteProjectTarget.id ? "删除中…" : "删除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageMain>
  );
}
