"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { UndatedTaskList } from "@/components/schedule/UndatedTaskList";
import { TaskDrawerWithComments, type TaskDrawerSaveContext } from "@/components/TaskDrawerWithComments";
import { fetchScheduleUndated } from "@/lib/api/schedule-views";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useTaskCreateDrawer } from "@/components/layout/TaskCreateDrawerContext";
import type {
  PriorityKey,
  ScheduleTaskItem,
  StatusKey,
} from "@/types/api/views/schedule";
import { localDatetimeRangeFromDateKey } from "@/components/schedule/taskUtils";
import { canClearScheduleByDrop } from "@/components/schedule/undatedTasks";

export default function MySchedulePage() {
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const scope = useMemo(() => ({ scope: "me" as const }), []);
  const [undatedItems, setUndatedItems] = useState<ScheduleTaskItem[] | null>(null);
  const [scheduleRefreshNonce, setScheduleRefreshNonce] = useState(0);
  const [undatedDragItemId, setUndatedDragItemId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<ScheduleTaskItem | null>(null);
  const draggingItemRef = useRef<ScheduleTaskItem | null>(null);

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
    fetchScheduleUndated(token, scope)
      .then((data) => setUndatedItems(data.items))
      .catch(() => setUndatedItems([]));
  }, [token, scope, scheduleRefreshNonce]);

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

  async function handleTaskCreated(ctx: TaskDrawerSaveContext) {
    // 派发全局事件，让 AppShell 统一处理便利贴 link（schedule 页用自己的 TaskDrawerWithComments）
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
    setScheduleRefreshNonce((n) => n + 1);
  }

  async function handleTaskDrawerSaved(_ctx: TaskDrawerSaveContext) {
    setScheduleRefreshNonce((n) => n + 1);
  }

  async function handleTaskDrawerDeleted(_deletedId: string) {
    closeTaskDrawer();
    setScheduleRefreshNonce((n) => n + 1);
  }

  function updateDraggingItem(item: ScheduleTaskItem | null) {
    if (item) draggingItemRef.current = item;
    setDraggingItem(item);
  }

  function handleUndatedDragItemIdChange(id: string | null) {
    setUndatedDragItemId(id);
    if (id == null) {
      setDraggingItem(null);
      return;
    }
    updateDraggingItem((undatedItems ?? []).find((entry) => entry.id === id) ?? null);
  }

  async function handleDropOnUndated(taskId: string) {
    const fromDrag = draggingItemRef.current?.id === taskId ? draggingItemRef.current : null;
    const item = fromDrag ?? (undatedItems ?? []).find((entry) => entry.id === taskId) ?? null;
    if (!item || !token || !canClearScheduleByDrop(item)) return;
    try {
      await apiFetch(`/workspaces/${item.workspace_id}/projects/${item.project_id}/items/${item.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ version: item.version, start_at: null, end_at: null }),
      });
      draggingItemRef.current = null;
      setDraggingItem(null);
      setScheduleRefreshNonce((n) => n + 1);
    } catch {
      // 失败时保持日历原状；下次拖放可再试
    }
  }

  return (
    <PageMain
      className="!px-3 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-hidden lg:[&>div]:flex lg:[&>div]:min-h-0 lg:[&>div]:flex-1 lg:[&>div]:flex-col"
      fullWidth
    >
      <div className="grid items-start gap-lg lg:min-h-0 lg:flex-1 lg:grid-cols-[240px_minmax(0,1fr)] lg:items-stretch lg:overflow-hidden">
        <aside
          id="my-schedule-undated-panel"
          className="flex min-h-0 flex-col lg:h-full lg:overflow-hidden"
        >
          <UndatedTaskList
            items={undatedItems}
            onItemClick={openDrawer}
            onAddTask={() => {
              setTaskDrawerOpen(false);
              setTaskDrawerItemId(null);
              setTaskDrawerWorkspaceId("");
              setTaskDrawerProjectId("");
              openCreate({ status: "todo", startAt: "", endAt: "" });
            }}
            onDragItemIdChange={handleUndatedDragItemIdChange}
            canAcceptDrop={draggingItem != null && canClearScheduleByDrop(draggingItem)}
            onDropTaskId={handleDropOnUndated}
          />
        </aside>

        <div className="min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
          <ScheduleBoard
            token={token}
            scope={scope}
            showProjectContext
            showAssigneeAvatar
            refreshNonce={scheduleRefreshNonce}
            onItemClick={openDrawer}
            onCreateInColumn={(status) => openTaskCreate(status)}
            onCreateInPriority={openTaskCreateInPriority}
            onCreateOnDate={openTaskCreateOnDate}
            extraItems={undatedItems ?? []}
            extraDragItemId={undatedDragItemId}
            onDraggingItemChange={updateDraggingItem}
            onTasksMutated={() => setScheduleRefreshNonce((n) => n + 1)}
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
