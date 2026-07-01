"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useScheduleViews } from "@/hooks/useScheduleViews";
import type {
  PriorityKey,
  ScheduleCalendarView,
  ScheduleScopeParams,
  ScheduleTaskItem,
  StatusKey,
} from "@/types/api/views/schedule";
import { PriorityQuadrants } from "./PriorityQuadrants";
import { ScheduleCalendar } from "./ScheduleCalendar";
import { SwimlaneKanban } from "./SwimlaneKanban";

export type ScheduleBoardProps = {
  token: string;
  scope: ScheduleScopeParams;
  showProjectContext?: boolean;
  showAssigneeAvatar?: boolean;
  onItemClick: (it: ScheduleTaskItem) => void;
  onCreateInColumn?: (status: StatusKey) => void;
  onCreateOnDate?: (dateKey: string, hour?: number) => void;
  /** 变更后递增以触发视图刷新（如任务创建/编辑） */
  refreshNonce?: number;
};

function findTaskItem(
  swimlane: ReturnType<typeof useScheduleViews>["swimlane"],
  priority: ReturnType<typeof useScheduleViews>["priority"],
  calendar: ScheduleCalendarView | null,
  itemId: string,
): ScheduleTaskItem | null {
  if (swimlane) {
    for (const list of Object.values(swimlane.columns)) {
      const hit = list.find((x) => x.id === itemId);
      if (hit) return hit;
    }
  }
  if (priority) {
    for (const list of Object.values(priority.quadrants)) {
      const hit = list.find((x) => x.id === itemId);
      if (hit) return hit;
    }
  }
  if (calendar) {
    if (calendar.day) {
      const hit = calendar.day.items.find((x) => x.id === itemId);
      if (hit) return hit;
    }
    for (const week of calendar.weeks) {
      for (const seg of week.segments) {
        if (seg.item.id === itemId) return seg.item;
      }
    }
  }
  return null;
}

export function ScheduleBoard({
  token,
  scope,
  showProjectContext = true,
  showAssigneeAvatar = false,
  onItemClick,
  onCreateInColumn,
  onCreateOnDate,
  refreshNonce = 0,
}: ScheduleBoardProps) {
  const {
    calendarMode,
    setCalendarMode,
    calendarAnchor,
    setCalendarAnchor,
    calendar,
    swimlane,
    priority,
    loading,
    error,
    setError,
    reloadAll,
  } = useScheduleViews({ token, scope });

  useEffect(() => {
    if (refreshNonce > 0) {
      void reloadAll();
    }
  }, [refreshNonce, reloadAll]);

  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverPriority, setDragOverPriority] = useState<PriorityKey | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<StatusKey | null>(null);
  const [priorityCountdownNowMs, setPriorityCountdownNowMs] = useState(() => Date.now());
  const [completingItemId, setCompletingItemId] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setPriorityCountdownNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const itemsByPriority = useMemo(
    () =>
      priority?.quadrants ?? {
        "1": [],
        "2": [],
        "3": [],
        "4": [],
      },
    [priority],
  );

  const byStatus = useMemo(
    () =>
      swimlane?.columns ?? {
        todo: [],
        doing: [],
        done: [],
        archived: [],
      },
    [swimlane],
  );

  function patchPath(it: ScheduleTaskItem) {
    return `/workspaces/${it.workspace_id}/projects/${it.project_id}/items/${it.id}`;
  }

  async function updateTaskPriority(itemId: string, newPriority: PriorityKey) {
    const current = findTaskItem(swimlane, priority, calendar, itemId);
    if (!current) return;
    try {
      await apiFetch(patchPath(current), {
        method: "PATCH",
        token,
        body: JSON.stringify({ version: current.version, priority: newPriority }),
      });
      await reloadAll();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "更新优先级失败";
      setError(msg);
    }
  }

  async function completeTask(itemId: string) {
    const current = findTaskItem(swimlane, priority, calendar, itemId);
    if (!current) return;
    if (current.status === "done" || current.status === "archived") return;
    setCompletingItemId(itemId);
    try {
      await updateTaskStatus(itemId, "done");
    } finally {
      setCompletingItemId(null);
    }
  }

  async function updateTaskStatus(itemId: string, newStatus: StatusKey) {
    const current = findTaskItem(swimlane, priority, calendar, itemId);
    if (!current) return;
    if ((current.status as StatusKey) === newStatus) return;
    try {
      await apiFetch(patchPath(current), {
        method: "PATCH",
        token,
        body: JSON.stringify({ version: current.version, status: newStatus }),
      });
      await reloadAll();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "更新状态失败";
      setError(msg);
    }
  }

  if (loading && !calendar) {
    return <div className="text-small text-text-secondary py-xl text-center">加载中…</div>;
  }

  return (
    <>
      {error && (
        <div className="mb-lg rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {error}
        </div>
      )}

      <PriorityQuadrants
        itemsByPriority={itemsByPriority}
        priorityCountdownNowMs={priorityCountdownNowMs}
        dragOverPriority={dragOverPriority}
        dragItemId={dragItemId}
        onDragItemIdChange={setDragItemId}
        onDragOverPriorityChange={setDragOverPriority}
        onDragLeavePriorityZone={(p) => setDragOverPriority((cur) => (cur === p ? null : cur))}
        onItemClick={onItemClick}
        onDropPriority={updateTaskPriority}
        onCompleteTask={completeTask}
        completingItemId={completingItemId}
        showProjectContext={showProjectContext}
        showAssigneeAvatar={showAssigneeAvatar}
      />

      <ScheduleCalendar
        calendarMode={calendarMode}
        onCalendarModeChange={setCalendarMode}
        calendarAnchor={calendarAnchor}
        onCalendarAnchorChange={setCalendarAnchor}
        calendar={calendar}
        onTaskClick={onItemClick}
        onCompleteTask={completeTask}
        completingItemId={completingItemId}
        showProjectContext={showProjectContext}
        showAssigneeAvatar={showAssigneeAvatar}
        onDateBlankClick={onCreateOnDate}
      />

      <SwimlaneKanban
        byStatus={byStatus}
        dragOverStatus={dragOverStatus}
        dragItemId={dragItemId}
        onDragItemIdChange={setDragItemId}
        onDragOverStatusChange={setDragOverStatus}
        onDragLeaveStatusColumn={(s) => setDragOverStatus((cur) => (cur === s ? null : cur))}
        onItemClick={onItemClick}
        onDropStatus={updateTaskStatus}
        onCreateInColumn={onCreateInColumn}
        showAssigneeAvatar={showAssigneeAvatar}
        showProjectContext={showProjectContext}
      />
    </>
  );
}
