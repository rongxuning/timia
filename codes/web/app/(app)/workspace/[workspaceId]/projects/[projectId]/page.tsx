"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";
import { UndatedTaskList } from "@/components/schedule/UndatedTaskList";
import { TaskDrawerWithComments, type TaskDrawerSaveContext } from "@/components/TaskDrawerWithComments";
import { useTaskCreateDrawer } from "@/components/layout/TaskCreateDrawerContext";
import { fetchScheduleUndated } from "@/lib/api/schedule-views";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { PriorityKey, ScheduleTaskItem, StatusKey } from "@/types/api/views/schedule";
import { localDatetimeRangeFromDateKey } from "@/components/schedule/taskUtils";
import { canClearScheduleByDrop, listProjectUndatedTasks } from "@/components/schedule/undatedTasks";

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const { workspaceId, projectId } = params;
  const token = useMemo(() => getToken(), []);

  const [undatedItems, setUndatedItems] = useState<ScheduleTaskItem[] | null>(null);
  const [scheduleRefreshNonce, setScheduleRefreshNonce] = useState(0);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerItemId, setTaskDrawerItemId] = useState<string | null>(null);
  const [taskDrawerVersion, setTaskDrawerVersion] = useState(0);
  const [undatedDragItemId, setUndatedDragItemId] = useState<string | null>(null);
  const [draggingItem, setDraggingItem] = useState<ScheduleTaskItem | null>(null);
  const draggingItemRef = useRef<ScheduleTaskItem | null>(null);
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

  useEffect(() => {
    if (!token) {
      router.push("/login");
    }
  }, [router, token]);

  useEffect(() => {
    if (!token) return;
    fetchScheduleUndated(token, scope)
      .then((data) => setUndatedItems(listProjectUndatedTasks(data.items, projectId)))
      .catch(() => setUndatedItems([]));
  }, [token, scope, projectId, scheduleRefreshNonce]);

  if (!token) return null;

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
    }
  }

  async function handleTaskDrawerSaved(ctx: TaskDrawerSaveContext) {
    const leftCurrentProject = ctx.projectId !== projectId || ctx.workspaceId !== workspaceId;
    taskLeftCurrentProjectRef.current = leftCurrentProject;
    bumpSchedule();
  }

  async function handleTaskCreated(ctx: TaskDrawerSaveContext) {
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
  }

  async function handleTaskDrawerDeleted(_deletedId: string) {
    closeTaskDrawer();
    bumpSchedule();
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
    if (!item || item.project_id !== projectId || !canClearScheduleByDrop(item)) return;
    try {
      await apiFetch(`/workspaces/${item.workspace_id}/projects/${item.project_id}/items/${item.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ version: item.version, start_at: null, end_at: null }),
      });
      draggingItemRef.current = null;
      setDraggingItem(null);
      bumpSchedule();
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
          id="project-detail-undated-panel"
          className="flex min-h-0 flex-col lg:h-full lg:overflow-hidden"
        >
          <UndatedTaskList
            items={undatedItems}
            onItemClick={openDrawer}
            onAddTask={() => {
              setTaskDrawerOpen(false);
              setTaskDrawerItemId(null);
              openCreate({ status: "todo", startAt: "", endAt: "" });
            }}
            onDragItemIdChange={handleUndatedDragItemIdChange}
            canAcceptDrop={
              draggingItem != null &&
              draggingItem.project_id === projectId &&
              canClearScheduleByDrop(draggingItem)
            }
            onDropTaskId={handleDropOnUndated}
            showProjectContext={false}
          />
        </aside>

        <div className="min-w-0 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
          <ScheduleBoard
            token={token}
            scope={scope}
            showProjectContext={false}
            showAssigneeAvatar
            refreshNonce={scheduleRefreshNonce}
            onItemClick={openDrawer}
            onCreateInColumn={openTaskCreate}
            onCreateInPriority={openTaskCreateInPriority}
            onCreateOnDate={openTaskCreateOnDate}
            extraItems={undatedItems ?? []}
            extraDragItemId={undatedDragItemId}
            onDraggingItemChange={updateDraggingItem}
            onTasksMutated={bumpSchedule}
            calendarFirst
            simplifiedSectionHeaders
          />
        </div>
      </div>

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
