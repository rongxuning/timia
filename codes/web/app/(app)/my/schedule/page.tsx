"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { ScheduleDashboardCards } from "@/components/dashboard/ScheduleDashboardCards";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { TaskDrawerWithComments, type TaskDrawerSaveContext } from "@/components/TaskDrawerWithComments";
import { fetchMyScheduleDashboard } from "@/lib/api/schedule-views";
import { getToken } from "@/lib/auth";
import { useTaskCreateDrawer } from "@/components/layout/TaskCreateDrawerContext";
import type {
  MyScheduleDashboardView,
  PriorityKey,
  ScheduleTaskItem,
  StatusKey,
} from "@/types/api/views/schedule";
import { localDatetimeRangeFromDateKey } from "@/components/schedule/taskUtils";

export default function MySchedulePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const scope = useMemo(() => ({ scope: "me" as const }), []);
  const [dashboard, setDashboard] = useState<MyScheduleDashboardView | null>(null);
  const [scheduleRefreshNonce, setScheduleRefreshNonce] = useState(0);

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

  if (!authReady || !token) return null;

  function openTaskCreate(
    status: StatusKey = "todo",
    dateKey?: string,
    hour?: number,
    priority: PriorityKey = "1",
  ) {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    setTaskDrawerWorkspaceId("");
    setTaskDrawerProjectId("");
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
    setTaskDrawerWorkspaceId(it.workspace_id);
    setTaskDrawerProjectId(it.project_id);
    setTaskDrawerItemId(it.id);
    setTaskDrawerVersion(it.version);
    setTaskDrawerOpen(true);
  }

  function closeTaskDrawer() {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    setTaskDrawerWorkspaceId("");
    setTaskDrawerProjectId("");
  }

  async function handleTaskCreated(_ctx: TaskDrawerSaveContext) {
    closeTaskCreate();
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
    <PageMain className="!px-3" fullWidth>
      <div className="grid items-start gap-lg lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside id="my-schedule-status-panel" className="self-start lg:sticky lg:top-lg">
          <ScheduleDashboardCards dashboard={dashboard} />
        </aside>

        <div className="min-w-0">
          <ScheduleBoard
            token={token}
            scope={scope}
            showProjectContext
            showAssigneeAvatar
            refreshNonce={scheduleRefreshNonce}
            onItemClick={openDrawer}
            onCreateInPriority={openTaskCreateInPriority}
            onCreateOnDate={openTaskCreateOnDate}
            calendarFirst
            simplifiedSectionHeaders
          />
        </div>
      </div>

      <TaskDrawerWithComments
        open={taskDrawerOpen && !!taskDrawerWorkspaceId && !!taskDrawerProjectId && !!taskDrawerItemId}
        onClose={closeTaskDrawer}
        workspaceId={taskDrawerWorkspaceId}
        projectId={taskDrawerProjectId}
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
        workspaceId=""
        projectId=""
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
