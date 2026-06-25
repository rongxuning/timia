"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FloatingDraggableButton } from "@/components/FloatingDraggableButton";
import { PageMain } from "@/components/layout";
import { ScheduleDashboardCards } from "@/components/dashboard/ScheduleDashboardCards";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { TaskDrawerWithComments, type TaskDrawerSaveContext } from "@/components/TaskDrawerWithComments";
import { fetchMyScheduleDashboard } from "@/lib/api/schedule-views";
import { getToken } from "@/lib/auth";
import type { MyScheduleDashboardView, ScheduleTaskItem, StatusKey } from "@/types/api/views/schedule";

export default function MySchedulePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const scope = useMemo(() => ({ scope: "me" as const }), []);
  const [dashboard, setDashboard] = useState<MyScheduleDashboardView | null>(null);
  const [scheduleRefreshNonce, setScheduleRefreshNonce] = useState(0);

  useEffect(() => {
    const t = getToken();
    setToken(t);
    setAuthReady(true);
    if (!t) router.push("/login");
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetchMyScheduleDashboard(token).then(setDashboard).catch(() => setDashboard(null));
  }, [token, scheduleRefreshNonce]);

  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerWorkspaceId, setTaskDrawerWorkspaceId] = useState("");
  const [taskDrawerProjectId, setTaskDrawerProjectId] = useState("");
  const [taskDrawerItemId, setTaskDrawerItemId] = useState<string | null>(null);
  const [taskDrawerVersion, setTaskDrawerVersion] = useState(0);
  const [taskDrawerSubtitle, setTaskDrawerSubtitle] = useState<string | null>(null);
  const [taskCreateDrawerOpen, setTaskCreateDrawerOpen] = useState(false);
  const [createInitialStatus, setCreateInitialStatus] = useState<StatusKey>("todo");

  if (!authReady || !token) return null;

  function openTaskCreate(status: StatusKey = "todo") {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    setTaskDrawerWorkspaceId("");
    setTaskDrawerProjectId("");
    setTaskDrawerSubtitle(null);
    setCreateInitialStatus(status);
    setTaskCreateDrawerOpen(true);
  }

  function openDrawer(it: ScheduleTaskItem) {
    setTaskCreateDrawerOpen(false);
    setTaskDrawerWorkspaceId(it.workspace_id);
    setTaskDrawerProjectId(it.project_id);
    setTaskDrawerItemId(it.id);
    setTaskDrawerVersion(it.version);
    setTaskDrawerSubtitle(`${it.workspace_name} / ${it.project_name}`);
    setTaskDrawerOpen(true);
  }

  function closeTaskDrawer() {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    setTaskDrawerWorkspaceId("");
    setTaskDrawerProjectId("");
    setTaskDrawerSubtitle(null);
  }

  async function handleTaskCreated(_ctx: TaskDrawerSaveContext) {
    setScheduleRefreshNonce((n) => n + 1);
  }

  async function handleTaskDrawerSaved(_ctx: TaskDrawerSaveContext) {
    setScheduleRefreshNonce((n) => n + 1);
  }

  async function handleTaskDrawerDeleted(_deletedId: string) {
    closeTaskDrawer();
    setScheduleRefreshNonce((n) => n + 1);
  }

  return (
    <PageMain>
      <ScheduleDashboardCards
        dashboard={dashboard}
        profileHint="仅展示你负责或参与的任务，跨工作空间聚合"
      />

      <ScheduleBoard
        token={token}
        scope={scope}
        showProjectContext
        showAssigneeAvatar
        refreshNonce={scheduleRefreshNonce}
        onItemClick={openDrawer}
      />

      <TaskDrawerWithComments
        open={taskDrawerOpen && !!taskDrawerWorkspaceId && !!taskDrawerProjectId && !!taskDrawerItemId}
        onClose={closeTaskDrawer}
        workspaceId={taskDrawerWorkspaceId}
        projectId={taskDrawerProjectId}
        itemId={taskDrawerItemId}
        highlightCommentId={null}
        token={token}
        titleSubtitle={taskDrawerSubtitle}
        syncVersion={taskDrawerVersion}
        onTaskSaved={handleTaskDrawerSaved}
        onTaskDeleted={handleTaskDrawerDeleted}
      />

      <TaskDrawerWithComments
        open={taskCreateDrawerOpen}
        onClose={() => setTaskCreateDrawerOpen(false)}
        workspaceId=""
        projectId=""
        itemId={null}
        highlightCommentId={null}
        token={token}
        variant="create"
        initialCreateStatus={createInitialStatus}
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
