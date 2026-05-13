"use client";

import type { ScheduleTaskItem, StatusKey } from "./types";
import { formatScheduleRange, normalizePriority, priorityBadgeClass, STATUSES } from "./taskUtils";

export type SwimlaneKanbanProps = {
  byStatus: Record<StatusKey, ScheduleTaskItem[]>;
  dragOverStatus: StatusKey | null;
  dragItemId: string | null;
  onDragItemIdChange: (id: string | null) => void;
  onDragOverStatusChange: (s: StatusKey | null) => void;
  onDragLeaveStatusColumn: (s: StatusKey) => void;
  onItemClick: (it: ScheduleTaskItem) => void;
  onDropStatus: (itemId: string, status: StatusKey) => void;
};

export function SwimlaneKanban({
  byStatus,
  dragOverStatus,
  dragItemId,
  onDragItemIdChange,
  onDragOverStatusChange,
  onDragLeaveStatusColumn,
  onItemClick,
  onDropStatus,
}: SwimlaneKanbanProps) {
  return (
    <section className="mb-lg overflow-hidden rounded-xl border border-border-subtle bg-white">
      <div className="border-b border-border-subtle p-lg">
        <div className="text-sm font-semibold text-primary">泳道图</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 border-b border-border-subtle bg-zinc-50/50">
        {STATUSES.map((s) => (
          <div key={s.key} className="flex items-center justify-between border-r border-border-subtle p-lg last:border-r-0">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${s.dotClass}`} />
              <span className="text-overline">{s.label}</span>
              <span className="text-caption text-neutral-muted">({byStatus[s.key].length})</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 h-[700px] divide-x divide-border-subtle">
        {STATUSES.map((s) => (
          <div
            key={s.key}
            className={[
              `space-y-4 overflow-y-auto p-lg ${s.bgClass}`,
              dragOverStatus === s.key ? "ring-2 ring-primary/20 ring-inset" : "",
            ].join(" ")}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOverStatusChange(s.key);
            }}
            onDragLeave={() => onDragLeaveStatusColumn(s.key)}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/task-id") || dragItemId;
              onDragOverStatusChange(null);
              onDragItemIdChange(null);
              if (!id) return;
              onDropStatus(id, s.key);
            }}
          >
            {byStatus[s.key].length === 0 ? (
              <div className="text-[12px] text-neutral-muted">暂无任务。</div>
            ) : (
              byStatus[s.key].map((it) => (
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
                    onDragOverStatusChange(null);
                  }}
                  className="w-full text-left bg-white border border-border-subtle rounded-xl p-lg hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer block"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 text-[10px] rounded font-bold ${priorityBadgeClass(it.priority)}`}>
                      P{normalizePriority(it.priority)}
                    </span>
                    <span
                      className="text-[10px] text-neutral-muted truncate max-w-[60%]"
                      title={`${it.workspace_name} / ${it.project_name}`}
                    >
                      {it.project_name}
                    </span>
                  </div>
                  <p className="text-small font-medium text-text-primary mt-2">{it.title}</p>
                  {it.body && <p className="text-caption text-neutral-muted mt-1 line-clamp-2">{it.body}</p>}
                  <div className="mt-4 flex items-center justify-between">
                    <a
                      className="text-[10px] text-primary hover:underline"
                      href={`/workspace/${it.workspace_id}/projects/${it.project_id}`}
                      onClick={(e) => e.stopPropagation()}
                      title="打开所在项目"
                    >
                      打开项目
                    </a>
                    {formatScheduleRange(it.start_at, it.end_at) && (
                      <span className="text-[10px] text-neutral-muted flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">schedule</span>
                        {formatScheduleRange(it.start_at, it.end_at)}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
