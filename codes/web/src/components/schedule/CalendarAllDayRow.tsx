"use client";

import { type DragEvent } from "react";
import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { CalendarTaskBar } from "./CalendarTaskBar";
import { CALENDAR_TASK_CARD_HEIGHT_PX } from "./taskUtils";

type Props = {
  columns: Array<{ key: string; items: ScheduleTaskItem[] }>;
  onTaskClick: (item: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
  showAssigneeAvatar?: boolean;
  /** 当前正在被拖的任务 id（用于高亮源） */
  dragItemId?: string | null;
  /** 当前 hover 的日期格（与 dragOverDateKey 同步） */
  dragOverDateKey?: string | null;
  /** 任务被拖起时回调 */
  onDragItemIdChange?: (id: string | null) => void;
  /** 当前 hover 落点变化时回调 */
  onDragOverDateKeyChange?: (key: string | null) => void;
  /** 任务拖到列上时回调（仅 week view 多列时启用） */
  onDropDateTime?: (taskId: string, target: { dateKey: string; hour: number | null }) => void;
};

export function CalendarAllDayRow({
  columns,
  onTaskClick,
  onCompleteTask,
  completingItemId = null,
  showProjectContext = true,
  showAssigneeAvatar = false,
  dragItemId = null,
  dragOverDateKey = null,
  onDragItemIdChange,
  onDragOverDateKeyChange,
  onDropDateTime,
}: Props) {
  const isWeek = columns.length === 7;
  // 仅周视图多列时启用 drop（日视图全天行不能改期）。拖出仍允许，以便拖到待添加任务。
  const droppable = isWeek && !!onDropDateTime;
  const sourceDraggable = !!onDragItemIdChange;

  function handleDragOver(e: DragEvent<HTMLDivElement>, key: string) {
    if (!droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDateKey !== key) {
      onDragOverDateKeyChange?.(key);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!droppable) return;
    // 只在离开整个列时清空（避免子元素冒泡触发）
    if (e.currentTarget !== e.target) return;
    onDragOverDateKeyChange?.(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, key: string) {
    if (!droppable || !onDropDateTime) return;
    e.preventDefault();
    const id = e.dataTransfer.getData("text/task-id") || dragItemId;
    onDragItemIdChange?.(null);
    onDragOverDateKeyChange?.(null);
    if (!id) return;
    onDropDateTime(id, { dateKey: key, hour: null });
  }

  return (
    <div className="flex shrink-0 border-b border-border-subtle bg-surface">
      <div className="flex w-14 shrink-0 items-start justify-end border-r border-border-subtle bg-surface-container-lowest/60 px-1 pt-2 text-[10px] text-neutral-muted">
        全天
      </div>
      <div className={isWeek ? "grid min-w-0 flex-1 grid-cols-7" : "min-w-0 flex-1"}>
        {columns.map(({ key, items }) => (
          <div
            key={key}
            className={[
              "flex min-h-10 min-w-0 flex-col gap-1 p-1",
              isWeek ? "border-r border-border-subtle last:border-r-0" : "",
              droppable && dragOverDateKey === key ? "bg-primary/10" : "",
            ].join(" ")}
            onDragOver={(e) => handleDragOver(e, key)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, key)}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className="min-w-0"
                style={{ height: CALENDAR_TASK_CARD_HEIGHT_PX }}
              >
                <CalendarTaskBar
                  item={item}
                  showLabel
                  roundLeft
                  roundRight
                  showProjectContext={showProjectContext}
                  showAssigneeAvatar={showAssigneeAvatar}
                  completingItemId={completingItemId}
                  onTaskClick={onTaskClick}
                  onCompleteTask={onCompleteTask}
                  compact
                  draggable={sourceDraggable && item.status !== "archived"}
                  onDragStart={
                    onDragItemIdChange
                      ? (it) => onDragItemIdChange(it.id)
                      : undefined
                  }
                  onDragEnd={
                    onDragItemIdChange ? () => onDragItemIdChange(null) : undefined
                  }
                  isDragging={dragItemId === item.id}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
