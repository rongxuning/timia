"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FloatingDraggableButton } from "@/components/FloatingDraggableButton";
import { PageMain } from "@/components/layout";
import { ProjectDashboardCards } from "@/components/project/ProjectDashboardCards";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { primeProjectNameForBreadcrumb, primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { TaskDrawerWithComments, type TaskDrawerSaveContext } from "@/components/TaskDrawerWithComments";
import { ProjectModal, type ProjectModalSuccessMeta } from "@/components/ProjectModal";
import { fetchProjectDashboard } from "@/lib/api/project-views";
import { getToken } from "@/lib/auth";
import type { ProjectDashboardView } from "@/types/api/views/project";
import type { ScheduleTaskItem, StatusKey } from "@/types/api/views/schedule";
import { localDatetimeRangeFromDateKey } from "@/components/schedule/taskUtils";

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const { workspaceId, projectId } = params;
  const token = useMemo(() => getToken(), []);

  const [dashboard, setDashboard] = useState<ProjectDashboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleRefreshNonce, setScheduleRefreshNonce] = useState(0);
  const [createInitialStatus, setCreateInitialStatus] = useState<StatusKey>("todo");
  const [createInitialStartAt, setCreateInitialStartAt] = useState("");
  const [createInitialEndAt, setCreateInitialEndAt] = useState("");
  const [taskCreateDrawerOpen, setTaskCreateDrawerOpen] = useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerItemId, setTaskDrawerItemId] = useState<string | null>(null);
  const [taskDrawerVersion, setTaskDrawerVersion] = useState(0);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const taskLeftCurrentProjectRef = useRef(false);

  const scope = useMemo(
    () => ({ scope: "project" as const, workspaceId, projectId }),
    [workspaceId, projectId],
  );

  const bumpSchedule = useCallback(() => setScheduleRefreshNonce((n) => n + 1), []);

  const reloadDashboard = useCallback(async () => {
    if (!token) return;
    const data = await fetchProjectDashboard(token, workspaceId, projectId);
    setDashboard(data);
    primeWorkspaceNameForBreadcrumb(data.workspace_id, data.workspace_name);
    primeProjectNameForBreadcrumb(workspaceId, data.project_id, data.name);
  }, [token, workspaceId, projectId]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    reloadDashboard().catch((e: { message?: string }) => setError(e?.message ?? "加载失败"));
  }, [router, token, reloadDashboard]);

  useEffect(() => {
    if (scheduleRefreshNonce === 0 || !token) return;
    reloadDashboard().catch(() => undefined);
  }, [scheduleRefreshNonce, token, reloadDashboard]);

  function openTaskCreate(status: StatusKey = "todo", dateKey?: string, hour?: number) {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    setCreateInitialStatus(status);
    if (dateKey) {
      const range = localDatetimeRangeFromDateKey(dateKey, hour);
      setCreateInitialStartAt(range.start);
      setCreateInitialEndAt(range.end);
    } else {
      setCreateInitialStartAt("");
      setCreateInitialEndAt("");
    }
    setTaskCreateDrawerOpen(true);
  }

  function openTaskCreateOnDate(dateKey: string, hour?: number) {
    openTaskCreate("todo", dateKey, hour);
  }

  function openDrawer(it: ScheduleTaskItem) {
    setTaskCreateDrawerOpen(false);
    taskLeftCurrentProjectRef.current = false;
    setTaskDrawerItemId(it.id);
    setTaskDrawerVersion(it.version);
    setTaskDrawerOpen(true);
  }

  function closeTaskDrawer() {
    const shouldRefresh = taskLeftCurrentProjectRef.current;
    taskLeftCurrentProjectRef.current = false;
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    if (shouldRefresh) {
      bumpSchedule();
      void reloadDashboard();
    }
  }

  async function handleTaskDrawerSaved(ctx: TaskDrawerSaveContext) {
    const leftCurrentProject = ctx.projectId !== projectId || ctx.workspaceId !== workspaceId;
    taskLeftCurrentProjectRef.current = leftCurrentProject;
    bumpSchedule();
    await reloadDashboard();
  }

  async function handleTaskCreated(ctx: TaskDrawerSaveContext) {
    if (ctx.projectId !== projectId) return;
    bumpSchedule();
    await reloadDashboard();
  }

  async function handleTaskDrawerDeleted(_deletedId: string) {
    closeTaskDrawer();
    bumpSchedule();
    await reloadDashboard();
  }

  return (
    <PageMain>
      <div className="space-y-2xl">
        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        <ProjectDashboardCards
          dashboard={dashboard}
          workspaceId={workspaceId}
          projectId={projectId}
          onEditProject={dashboard?.can_manage ? () => setEditProjectOpen(true) : undefined}
          onCreateTask={() => openTaskCreate("todo")}
        />

        <ScheduleBoard
          token={token!}
          scope={scope}
          showProjectContext={false}
          showAssigneeAvatar
          refreshNonce={scheduleRefreshNonce}
          onItemClick={openDrawer}
          onCreateInColumn={openTaskCreate}
          onCreateOnDate={openTaskCreateOnDate}
        />
      </div>

      <ProjectModal
        open={editProjectOpen && !!dashboard?.can_manage}
        onClose={() => setEditProjectOpen(false)}
        workspaceId={workspaceId}
        token={token}
        mode="edit"
        projectId={projectId}
        initialName={dashboard?.name ?? ""}
        initialDescription={dashboard?.description}
        onSuccess={(project, meta?: ProjectModalSuccessMeta) => {
          setEditProjectOpen(false);
          if (meta?.workspaceChanged && project.workspace_id !== workspaceId) {
            if (meta.workspaceName) {
              primeWorkspaceNameForBreadcrumb(project.workspace_id, meta.workspaceName);
            }
            primeProjectNameForBreadcrumb(project.workspace_id, project.id, project.name);
            router.replace(`/workspace/${project.workspace_id}/projects/${project.id}`);
            return;
          }
          void reloadDashboard();
        }}
      />

      <TaskDrawerWithComments
        open={taskDrawerOpen && !!taskDrawerItemId}
        onClose={closeTaskDrawer}
        workspaceId={workspaceId}
        projectId={projectId}
        itemId={taskDrawerItemId}
        highlightCommentId={null}
        token={token}
        syncVersion={taskDrawerVersion}
        onTaskSaved={handleTaskDrawerSaved}
        onTaskDeleted={handleTaskDrawerDeleted}
      />

      <TaskDrawerWithComments
        open={taskCreateDrawerOpen}
        onClose={() => setTaskCreateDrawerOpen(false)}
        workspaceId={workspaceId}
        projectId={projectId}
        itemId={null}
        highlightCommentId={null}
        token={token}
        variant="create"
        initialCreateStatus={createInitialStatus}
        initialCreateStartAt={createInitialStartAt}
        initialCreateEndAt={createInitialEndAt}
        onTaskCreated={handleTaskCreated}
      />

      <FloatingDraggableButton
        ariaLabel="新建任务"
        className="flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-primary text-on-primary shadow-lg shadow-indigo-100 transition-colors hover:bg-primary-hover active:cursor-grabbing"
        onClick={() => openTaskCreate("todo")}
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </FloatingDraggableButton>
    </PageMain>
  );
}
