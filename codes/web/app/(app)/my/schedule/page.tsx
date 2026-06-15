"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { ScheduleDashboardCards } from "@/components/dashboard/ScheduleDashboardCards";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { TaskDrawerWithComments, type TaskDrawerItem } from "@/components/TaskDrawerWithComments";
import { fetchMyScheduleDashboard } from "@/lib/api/schedule-views";
import { getToken } from "@/lib/auth";
import type { MyScheduleDashboardView, ScheduleTaskItem } from "@/types/api/views/schedule";

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

  if (!authReady || !token) return null;

  function openDrawer(it: ScheduleTaskItem) {
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

  async function handleTaskDrawerSaved(_updated: TaskDrawerItem) {
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
    </PageMain>
  );
}
