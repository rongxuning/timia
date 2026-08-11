"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import type { CalendarDropTarget } from "./ScheduleCalendar.types";
import { computeRescheduledRange } from "./taskUtils";
import { dayKeyLocal } from "./taskUtils";

export type ScheduleBoardProps = {
  token: string;
  scope: ScheduleScopeParams;
  showProjectContext?: boolean;
  showAssigneeAvatar?: boolean;
  onItemClick: (it: ScheduleTaskItem) => void;
  onCreateInColumn?: (status: StatusKey) => void;
  onCreateInPriority?: (priority: PriorityKey) => void;
  onCreateOnDate?: (dateKey: string, hour?: number) => void;
  /** 变更后递增以触发视图刷新（如任务创建/编辑） */
  refreshNonce?: number;
  /** 使用“日历、优先级、泳道图”的纵向展示顺序。 */
  calendarFirst?: boolean;
  simplifiedSectionHeaders?: boolean;
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
  onCreateInPriority,
  onCreateOnDate,
  refreshNonce = 0,
  calendarFirst = false,
  simplifiedSectionHeaders = false,
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
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [dragOverHour, setDragOverHour] = useState<number | null>(null);
  const [priorityCountdownNowMs, setPriorityCountdownNowMs] = useState(() => Date.now());
  const [completingItemId, setCompletingItemId] = useState<string | null>(null);
  const [reschedulingItemId, setReschedulingItemId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(msg: string, ttlMs = 3000) {
    setToastMessage(msg);
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, ttlMs);
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current != null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

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

  /** 比较新旧 start_at / end_at 是否完全相同（按 ms 时间戳；null/不存在视为 null） */
  function isSameDateTimeRange(
    item: ScheduleTaskItem,
    range: { startAt: string; endAt: string | null },
  ): boolean {
    const oldStartMs = item.start_at ? new Date(item.start_at).getTime() : null;
    const newStartMs = new Date(range.startAt).getTime();
    if (oldStartMs !== newStartMs) return false;
    const oldEndMs = item.end_at ? new Date(item.end_at).getTime() : null;
    const newEndMs = range.endAt ? new Date(range.endAt).getTime() : null;
    return oldEndMs === newEndMs;
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

  async function toggleTaskCompletion(itemId: string) {
    const current = findTaskItem(swimlane, priority, calendar, itemId);
    if (!current) return;
    if (current.status === "archived") return;
    const markAsDone = current.status !== "done";
    setCompletingItemId(itemId);
    try {
      await updateTaskStatus(
        itemId,
        markAsDone ? "done" : "todo",
        markAsDone ? new Date().toISOString() : null,
      );
    } finally {
      setCompletingItemId(null);
    }
  }

  async function updateTaskStatus(
    itemId: string,
    newStatus: StatusKey,
    completedAt?: string | null,
  ) {
    const current = findTaskItem(swimlane, priority, calendar, itemId);
    if (!current) return;
    if ((current.status as StatusKey) === newStatus) return;
    try {
      await apiFetch(patchPath(current), {
        method: "PATCH",
        token,
        body: JSON.stringify({
          version: current.version,
          status: newStatus,
          ...(completedAt !== undefined ? { completed_at: completedAt } : {}),
        }),
      });
      await reloadAll();
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "更新状态失败";
      setError(msg);
    }
  }

  /**
   * 日历拖拽改期：PATCH start_at / end_at，保留原 duration
   * - 由各视图（month / week / day）的 onDropDateTime 调用
   * - 保留原有完成时间等其他字段
   * - 原地不动（start_at / end_at 与新值完全相同）则跳过 PATCH
   * - 409 版本冲突走 toast；其它错误走 setError 红条
   */
  async function rescheduleTask(item: ScheduleTaskItem, target: CalendarDropTarget) {
    if (reschedulingItemId) return; // 防重入
    const anchorKey = dayKeyLocal(new Date());
    const range = computeRescheduledRange(item, target, anchorKey);
    try {
      if (!range) {
        showToast("该任务不能拖到此位置");
        return;
      }
      // #1：原地不动 → 直接清状态，不发请求
      if (isSameDateTimeRange(item, range)) {
        return;
      }
      setReschedulingItemId(item.id);
      await apiFetch(patchPath(item), {
        method: "PATCH",
        token,
        body: JSON.stringify({
          version: item.version,
          start_at: range.startAt,
          end_at: range.endAt,
        }),
      });
      await reloadAll();
    } catch (e: unknown) {
      const apiErr = e as { status?: number; message?: string } | null;
      // #2：版本冲突用轻量 toast，不挤占顶部红条
      if (apiErr?.status === 409) {
        showToast("任务已被他人修改，已为你刷新到最新版本");
        // 静默 reload 一次，避免日历上残留过期数据
        await reloadAll();
      } else {
        const msg = apiErr?.message ?? "改期失败";
        setError(msg);
      }
    } finally {
      setReschedulingItemId(null);
      setDragOverDateKey(null);
      setDragOverHour(null);
    }
  }

  function handleCalendarDrop(taskId: string, target: CalendarDropTarget) {
    setDragItemId(null);
    const current = findTaskItem(swimlane, priority, calendar, taskId);
    if (!current) return;
    void rescheduleTask(current, target);
  }

  function handleCalendarDragItemIdChange(id: string | null) {
    setDragItemId(id);
    if (id === null) {
      setDragOverDateKey(null);
      setDragOverHour(null);
    }
  }

  if (loading && !calendar) {
    return <div className="text-small text-text-secondary py-xl text-center">加载中…</div>;
  }

  const priorityView = (
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
        onCreateInPriority={onCreateInPriority}
        onCompleteTask={toggleTaskCompletion}
        completingItemId={completingItemId}
        showProjectContext={showProjectContext}
        showAssigneeAvatar={showAssigneeAvatar}
        hideHeader={simplifiedSectionHeaders}
    />
  );

  const calendarView = (
    <ScheduleCalendar
        calendarMode={calendarMode}
        onCalendarModeChange={setCalendarMode}
        calendarAnchor={calendarAnchor}
        onCalendarAnchorChange={setCalendarAnchor}
        calendar={calendar}
        onTaskClick={onItemClick}
        onCompleteTask={toggleTaskCompletion}
        completingItemId={completingItemId}
        showProjectContext={showProjectContext}
        showAssigneeAvatar={showAssigneeAvatar}
        onDateBlankClick={onCreateOnDate}
        dragItemId={dragItemId}
        dragOverDateKey={dragOverDateKey}
        dragOverHour={dragOverHour}
        onDragItemIdChange={handleCalendarDragItemIdChange}
        onDragOverDateKeyChange={setDragOverDateKey}
        onDragOverHourChange={setDragOverHour}
        onDropDateTime={handleCalendarDrop}
        reschedulingItemId={reschedulingItemId}
    />
  );

  return (
    <>
      {error && (
        <div className="mb-lg rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
          {error}
        </div>
      )}

      {/* Toast：用于版本冲突等轻量提示，3s 自动消失 */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
        >
          <div className="pointer-events-auto max-w-sm rounded-xl bg-text-primary text-on-primary px-4 py-2 text-small shadow-lg opacity-95">
            {toastMessage}
          </div>
        </div>
      )}

      {calendarFirst ? (
        <>
          {calendarView}
          {priorityView}
        </>
      ) : (
        <>
          {priorityView}
          {calendarView}
        </>
      )}

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
        hideHeader={simplifiedSectionHeaders}
        violetStatusHeader={simplifiedSectionHeaders}
      />
    </>
  );
}
