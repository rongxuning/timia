"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { ProjectDashboardCards } from "@/components/project/ProjectDashboardCards";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { primeProjectNameForBreadcrumb, primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { TaskDrawerWithComments, type TaskDrawerSaveContext } from "@/components/TaskDrawerWithComments";
import { ProjectModal, type ProjectModalSuccessMeta } from "@/components/ProjectModal";
import { useTaskCreateDrawer } from "@/components/layout/TaskCreateDrawerContext";
import { fetchProjectDashboard } from "@/lib/api/project-views";
import { getToken } from "@/lib/auth";
import type { ProjectDashboardView } from "@/types/api/views/project";
import type { PriorityKey, ScheduleTaskItem, StatusKey } from "@/types/api/views/schedule";
import { localDatetimeRangeFromDateKey } from "@/components/schedule/taskUtils";

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const { workspaceId, projectId } = params;
  const token = useMemo(() => getToken(), []);

  const [dashboard, setDashboard] = useState<ProjectDashboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleRefreshNonce, setScheduleRefreshNonce] = useState(0);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerItemId, setTaskDrawerItemId] = useState<string | null>(null);
  const [taskDrawerVersion, setTaskDrawerVersion] = useState(0);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const taskLeftCurrentProjectRef = useRef(false);
  const {
    open: taskCreateOpen,
    initialStatus,
    initialPriority,
    initialStartAt,
    initialEndAt,
    initialTitle,
    initialBody,
    initialLocation,
    openCreate,
    close: closeTaskCreate,
  } = useTaskCreateDrawer();

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

  function openTaskCreate(
    status: StatusKey = "todo",
    dateKey?: string,
    hour?: number,
    priority: PriorityKey = "1",
  ) {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    if (dateKey) {
      const range = localDatetimeRangeFromDateKey(dateKey, hour);
      openCreate({ status, priority, startAt: range.start, endAt: range.end });
    } else {
      openCreate({ status, priority });
    }
  }

  function openTaskCreateOnDate(dateKey: string, hour?: number) {
    openTaskCreate("todo", dateKey, hour);
  }

  function openTaskCreateInPriority(priority: PriorityKey) {
    openTaskCreate("todo", undefined, undefined, priority);
  }

  function openDrawer(it: ScheduleTaskItem) {
    closeTaskCreate();
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
    // 派发全局事件，让 AppShell 统一处理便利贴 link
    window.dispatchEvent(
      new CustomEvent("app:task-created", {
        detail: {
          itemId: ctx.item.id,
          workspaceId: ctx.workspaceId,
          projectId: ctx.projectId,
        },
      }),
    );
    closeTaskCreate();
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
    <PageMain className="!px-3" fullWidth>
      {error && (
        <div className="mb-lg rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {error}
        </div>
      )}

      <div className="grid items-start gap-lg lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside id="project-detail-status-panel" className="self-start lg:sticky lg:top-lg">
          <ProjectDashboardCards
            dashboard={dashboard}
            workspaceId={workspaceId}
            projectId={projectId}
            onEditProject={dashboard?.can_manage ? () => setEditProjectOpen(true) : undefined}
          />
        </aside>

        <div className="min-w-0">
          <ScheduleBoard
            token={token!}
            scope={scope}
            showProjectContext={false}
            showAssigneeAvatar
            refreshNonce={scheduleRefreshNonce}
            onItemClick={openDrawer}
            onCreateInColumn={openTaskCreate}
            onCreateInPriority={openTaskCreateInPriority}
            onCreateOnDate={openTaskCreateOnDate}
            calendarFirst
            simplifiedSectionHeaders
          />
        </div>
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
        initialColor={dashboard?.color ?? "#FFFFFF"}
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
        open={taskCreateOpen}
        onClose={closeTaskCreate}
        workspaceId={workspaceId}
        projectId={projectId}
        itemId={null}
        highlightCommentId={null}
        token={token}
        variant="create"
        initialCreateStatus={initialStatus}
        initialCreatePriority={initialPriority}
        initialCreateStartAt={initialStartAt}
        initialCreateEndAt={initialEndAt}
        initialCreateTitle={initialTitle}
        initialCreateBody={initialBody}
        initialCreateLocation={initialLocation}
        onTaskCreated={handleTaskCreated}
      />
    </PageMain>
  );
}
