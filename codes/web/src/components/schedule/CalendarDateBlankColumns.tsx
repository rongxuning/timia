"use client";

import { type DragEvent } from "react";

type Props = {
  dateKeys: string[];
  onDateBlankClick?: (dateKey: string) => void;
  /** 当前正在被拖的任务 id */
  dragItemId?: string | null;
  /** 当前 hover 的日期格 */
  dragOverDateKey?: string | null;
  /** hover 变化回调 */
  onDragOverDateKeyChange?: (key: string | null) => void;
  /** 任务拖到日期列上时回调（只携带 taskId，由父组件 resolve item） */
  onDropDateTime?: (taskId: string, target: { dateKey: string; hour: number | null }) => void;
};

const columnBorderClass = (col: number, total: number) =>
  [
    "border-r border-border-subtle",
    col === 0 ? "border-l border-border-subtle" : "",
    col === total - 1 ? "border-r-0" : "",
  ].join(" ");

export function CalendarDateBlankColumns({
  dateKeys,
  onDateBlankClick,
  dragItemId = null,
  dragOverDateKey = null,
  onDragOverDateKeyChange,
  onDropDateTime,
}: Props) {
  const droppable = !!onDropDateTime;

  function handleDragOver(e: DragEvent<HTMLButtonElement>, key: string) {
    if (!droppable) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragOverDateKey !== key) onDragOverDateKeyChange?.(key);
  }

  function handleDragLeave(e: DragEvent<HTMLButtonElement>) {
    if (!droppable) return;
    if (e.currentTarget !== e.target) return;
    onDragOverDateKeyChange?.(null);
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>, key: string) {
    if (!droppable || !onDropDateTime) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData("text/task-id") || dragItemId;
    onDragOverDateKeyChange?.(null);
    if (!id) return;
    // 月视图落点只携带日期，小时为 null（保留原时分）
    onDropDateTime(id, { dateKey: key, hour: null });
  }

  if (!onDateBlankClick && !droppable) {
    return (
      <div className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7" aria-hidden>
        {dateKeys.map((key, col) => (
          <div key={key} className={columnBorderClass(col, dateKeys.length)} />
        ))}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-0 grid grid-cols-7">
      {dateKeys.map((key, col) => (
        <button
          key={key}
          type="button"
          className={[
            columnBorderClass(col, dateKeys.length),
            onDateBlankClick ? "cursor-pointer bg-transparent transition-colors hover:bg-primary/5" : "",
            droppable && dragOverDateKey === key ? "bg-primary/15" : "",
          ].join(" ")}
          onClick={onDateBlankClick ? () => onDateBlankClick(key) : undefined}
          onDragOver={droppable ? (e) => handleDragOver(e, key) : undefined}
          onDragLeave={droppable ? handleDragLeave : undefined}
          onDrop={droppable ? (e) => handleDrop(e, key) : undefined}
          title={onDateBlankClick ? "点击添加任务" : undefined}
          aria-label={onDateBlankClick ? `在 ${key} 添加任务` : undefined}
        />
      ))}
    </div>
  );
}
