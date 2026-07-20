"use client";

import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { CalendarTaskBar } from "./CalendarTaskBar";

type Props = {
  columns: Array<{ key: string; items: ScheduleTaskItem[] }>;
  onTaskClick: (item: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
  showAssigneeAvatar?: boolean;
};

export function CalendarAllDayRow({
  columns,
  onTaskClick,
  onCompleteTask,
  completingItemId = null,
  showProjectContext = true,
  showAssigneeAvatar = false,
}: Props) {
  const isWeek = columns.length === 7;

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
            ].join(" ")}
          >
            {items.map((item) => (
              <div key={item.id} className="h-8 min-w-0">
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
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
