"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { CalendarTaskCard } from "./CalendarTaskCard";
import { filterTasksByTitle } from "./undatedTasks";
import {
  CALENDAR_TASK_CARD_HEIGHT_PX,
  calendarTaskSurfaceStyle,
  taskCalendarColors,
  taskLabelStripeColor,
} from "./taskUtils";

export type UndatedTaskListProps = {
  items: ScheduleTaskItem[] | null;
  onItemClick: (it: ScheduleTaskItem) => void;
  onAddTask?: () => void;
  onDragItemIdChange?: (id: string | null) => void;
  canAcceptDrop?: boolean;
  onDropTaskId?: (taskId: string) => void;
  showProjectContext?: boolean;
};

export function UndatedTaskList({
  items,
  onItemClick,
  onAddTask,
  onDragItemIdChange,
  canAcceptDrop = false,
  onDropTaskId,
  showProjectContext = true,
}: UndatedTaskListProps) {
  const [titleQuery, setTitleQuery] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const skipClickRef = useRef(false);
  const visibleItems = useMemo(
    () => (items == null ? [] : filterTasksByTitle(items, titleQuery)),
    [items, titleQuery],
  );

  function handleDragStart(item: ScheduleTaskItem, e: DragEvent<HTMLButtonElement>) {
    skipClickRef.current = true;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/task-id", item.id);
    e.dataTransfer.setData("text/plain", item.id);
    try {
      e.dataTransfer.setDragImage(e.currentTarget, 0, 0);
    } catch {
      // ignore setDragImage failures
    }
    onDragItemIdChange?.(item.id);
  }

  function handleDragEnd() {
    onDragItemIdChange?.(null);
    window.setTimeout(() => {
      skipClickRef.current = false;
    }, 0);
  }

  function handlePanelDragOver(e: DragEvent<HTMLElement>) {
    if (!canAcceptDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  }

  function handlePanelDragLeave(e: DragEvent<HTMLElement>) {
    const next = e.relatedTarget;
    if (next instanceof Node && e.currentTarget.contains(next)) return;
    setIsDragOver(false);
  }

  function handlePanelDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData("text/task-id") || e.dataTransfer.getData("text/plain");
    if (taskId) onDropTaskId?.(taskId);
  }

  return (
    <section
      className={[
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-white transition-colors",
        isDragOver && canAcceptDrop ? "border-primary ring-2 ring-primary/20" : "border-border-subtle",
      ].join(" ")}
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
    >
      <div className="shrink-0 border-b border-border-subtle p-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-primary">未确认启动时间</div>
          {onAddTask ? (
            <button
              type="button"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-muted transition-colors hover:bg-surface-container-lowest hover:text-text-primary"
              onClick={onAddTask}
              title="添加任务"
              aria-label="添加任务"
            >
              <span className="material-symbols-outlined text-[18px] leading-none">add</span>
            </button>
          ) : null}
        </div>
        <label className="mt-3 block">
          <span className="sr-only">搜索任务标题</span>
          <input
            type="search"
            value={titleQuery}
            onChange={(event) => setTitleQuery(event.target.value)}
            placeholder="搜索任务标题"
            className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-lg max-lg:max-h-[min(70vh,40rem)]">
        {items == null ? (
          <div className="h-[72px] animate-pulse rounded-lg border border-border-subtle bg-surface-container-lowest" />
        ) : visibleItems.length === 0 ? (
          <div className="text-[12px] text-neutral-muted">
            {titleQuery.trim() ? "没有匹配的任务。" : "暂无任务。"}
          </div>
        ) : (
          visibleItems.map((it) => {
            const colors = taskCalendarColors(it.priority);
            const surface = calendarTaskSurfaceStyle(colors, it.status);
            return (
              <button
                key={it.id}
                type="button"
                draggable
                onDragStart={(e) => handleDragStart(it, e)}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (skipClickRef.current) return;
                  onItemClick(it);
                }}
                className="relative block w-full cursor-grab overflow-hidden text-left shadow-sm transition-[filter] hover:brightness-[0.97] active:cursor-grabbing"
                style={{
                  ...surface,
                  height: CALENDAR_TASK_CARD_HEIGHT_PX,
                  borderWidth: 1,
                  borderLeftWidth: 4,
                  borderStyle: "solid",
                  borderLeftColor: taskLabelStripeColor(it.color, colors.border),
                  borderRadius: 8,
                }}
              >
                <CalendarTaskCard item={it} showProjectContext={showProjectContext} showStatusControl={false} />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
