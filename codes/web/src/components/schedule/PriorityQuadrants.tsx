"use client";

import type { PriorityKey, ScheduleTaskItem } from "@/types/api/views/schedule";
import {
  countdownBadgeClass,
  countdownTargetForItem,
  formatRemainDHM,
} from "./taskUtils";

const QUADRANTS = [
  { p: "1" as const, title: "P1（低）", colorClass: "bg-blue-50 border-blue-100", dotClass: "bg-blue-500" },
  { p: "2" as const, title: "P2", colorClass: "bg-green-50 border-green-100", dotClass: "bg-green-500" },
  { p: "3" as const, title: "P3", colorClass: "bg-yellow-50 border-yellow-100", dotClass: "bg-yellow-500" },
  { p: "4" as const, title: "P4（高）", colorClass: "bg-red-50 border-red-100", dotClass: "bg-red-500" },
];

export type PriorityQuadrantsProps = {
  itemsByPriority: Record<PriorityKey, ScheduleTaskItem[]>;
  priorityCountdownNowMs: number;
  dragOverPriority: PriorityKey | null;
  dragItemId: string | null;
  onDragItemIdChange: (id: string | null) => void;
  onDragOverPriorityChange: (p: PriorityKey | null) => void;
  onDragLeavePriorityZone: (p: PriorityKey) => void;
  onItemClick: (it: ScheduleTaskItem) => void;
  onDropPriority: (itemId: string, priority: PriorityKey) => void;
  /** 任务卡片展示项目名（跨项目视图） */
  showProjectContext?: boolean;
};

function taskTooltip(it: ScheduleTaskItem, cdText: string | null, showProjectContext: boolean) {
  const parts = [it.title];
  if (cdText) parts.push(cdText);
  if (showProjectContext) parts.push(`${it.workspace_name} / ${it.project_name}`);
  return parts.join(" · ");
}

export function PriorityQuadrants({
  itemsByPriority,
  priorityCountdownNowMs,
  dragOverPriority,
  dragItemId,
  onDragItemIdChange,
  onDragOverPriorityChange,
  onDragLeavePriorityZone,
  onItemClick,
  onDropPriority,
  showProjectContext = true,
}: PriorityQuadrantsProps) {
  return (
    <section className="bg-white rounded-xl border border-border-subtle overflow-hidden mb-lg">
      <div className="p-lg flex items-center justify-between gap-lg">
        <div>
          <div className="text-sm font-semibold text-primary">优先级象限</div>
          <p className="mt-0.5 text-caption text-neutral-muted">仅展示待办与进行中的任务</p>
        </div>
      </div>

      <div className="p-lg pt-0">
        <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
          {QUADRANTS.map((q) => {
            const list = itemsByPriority[q.p];
            return (
              <div
                key={q.p}
                className={[
                  `rounded-xl border ${q.colorClass} p-lg`,
                  dragOverPriority === q.p ? "ring-2 ring-primary/25 ring-inset" : "",
                ].join(" ")}
                onDragOver={(e) => {
                  e.preventDefault();
                  onDragOverPriorityChange(q.p);
                }}
                onDragLeave={() => onDragLeavePriorityZone(q.p)}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/task-id") || dragItemId;
                  onDragOverPriorityChange(null);
                  onDragItemIdChange(null);
                  if (!id) return;
                  onDropPriority(id, q.p);
                }}
              >
                <div className="flex items-center justify-between gap-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${q.dotClass}`} />
                    <div className="font-medium text-text-primary truncate">{q.title}</div>
                  </div>
                  <div className="text-caption text-neutral-muted">{list.length} 个任务</div>
                </div>
                <div className="mt-3 space-y-1.5">
                  {list.length === 0 ? (
                    <div className="text-[12px] text-neutral-muted">暂无任务。</div>
                  ) : (
                    list.slice(0, 6).map((it) => {
                      const target = countdownTargetForItem(it);
                      const targetMs = target?.getTime();
                      const cd =
                        targetMs != null ? formatRemainDHM(targetMs, priorityCountdownNowMs) : null;
                      const countdownClass =
                        targetMs != null ? countdownBadgeClass(targetMs, priorityCountdownNowMs) : null;
                      return (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => onItemClick(it)}
                          draggable
                          onDragStart={(e) => {
                            onDragItemIdChange(it.id);
                            e.dataTransfer.setData("text/task-id", it.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            onDragItemIdChange(null);
                            onDragOverPriorityChange(null);
                          }}
                          className="w-full text-left rounded-lg bg-white/70 hover:bg-white border border-border-subtle px-2 py-1.5 text-[12px] text-text-primary transition-colors"
                          title={taskTooltip(it, cd?.text ?? null, showProjectContext)}
                        >
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
                            {cd && countdownClass ? (
                              <span
                                className={[
                                  "shrink-0 whitespace-nowrap px-2 py-0.5 text-[10px] rounded font-bold tabular-nums leading-none",
                                  countdownClass,
                                ].join(" ")}
                              >
                                {cd.text}
                              </span>
                            ) : null}
                          </div>
                          {showProjectContext ? (
                            <div className="mt-0.5 truncate text-[10px] text-neutral-muted">{it.project_name}</div>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                  {list.length > 6 && (
                    <div className="text-[11px] text-neutral-muted font-medium">还有 +{list.length - 6} 个</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
