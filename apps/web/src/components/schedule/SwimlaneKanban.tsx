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
  /** 列头「+」：传入后在每列显示快捷建任务按钮 */
  onCreateInColumn?: (status: StatusKey) => void;
  /** 卡片底部展示负责人首字母头像 */
  showAssigneeAvatar?: boolean;
  /** 卡片展示项目名与「打开项目」链接（跨项目视图） */
  showProjectContext?: boolean;
};

function AssigneeAvatar({ displayName }: { displayName: string }) {
  return (
    <div
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white bg-surface-container text-[10px] font-bold text-on-surface-variant"
      title={displayName}
    >
      {(displayName.trim().slice(0, 1) || "?").toUpperCase()}
    </div>
  );
}

export function SwimlaneKanban({
  byStatus,
  dragOverStatus,
  dragItemId,
  onDragItemIdChange,
  onDragOverStatusChange,
  onDragLeaveStatusColumn,
  onItemClick,
  onDropStatus,
  onCreateInColumn,
  showAssigneeAvatar = false,
  showProjectContext = true,
}: SwimlaneKanbanProps) {
  return (
    <section className="mb-lg overflow-hidden rounded-xl border border-border-subtle bg-white">
      <div className="border-b border-border-subtle p-lg">
        <div className="text-sm font-semibold text-primary">泳道图</div>
      </div>

      <div className="grid grid-cols-1 border-b border-border-subtle bg-zinc-50/50 md:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map((s) => (
          <div
            key={s.key}
            className="flex items-center justify-between border-r border-border-subtle p-lg last:border-r-0"
          >
            <div className="flex items-center gap-2">
              <div className={`h-2 w-2 rounded-full ${s.dotClass}`} />
              <span className="text-overline">{s.label}</span>
              <span className="text-caption text-neutral-muted">({byStatus[s.key].length})</span>
            </div>
            {onCreateInColumn ? (
              <button
                type="button"
                className="material-symbols-outlined cursor-pointer text-lg text-neutral-muted hover:text-text-primary"
                onClick={() => onCreateInColumn(s.key)}
                title="添加任务"
                aria-label={`在${s.label}列添加任务`}
              >
                add
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid h-[700px] grid-cols-1 divide-x divide-border-subtle md:grid-cols-2 xl:grid-cols-4">
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
                  className="block w-full cursor-pointer rounded-xl border border-border-subtle bg-white p-lg text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div
                    className={
                      showProjectContext
                        ? "flex items-center justify-between gap-2"
                        : "flex items-center gap-2"
                    }
                  >
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold ${priorityBadgeClass(it.priority)}`}
                    >
                      P{normalizePriority(it.priority)}
                    </span>
                    {showProjectContext ? (
                      <span
                        className="max-w-[60%] truncate text-[10px] text-neutral-muted"
                        title={`${it.workspace_name} / ${it.project_name}`}
                      >
                        {it.project_name}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-small font-medium text-text-primary">{it.title}</p>
                  {it.body && <p className="mt-1 line-clamp-2 text-caption text-neutral-muted">{it.body}</p>}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {showAssigneeAvatar && it.assignee ? (
                        <AssigneeAvatar displayName={it.assignee.display_name} />
                      ) : null}
                      {showProjectContext ? (
                        <a
                          className="text-[10px] text-primary hover:underline"
                          href={`/workspace/${it.workspace_id}/projects/${it.project_id}`}
                          onClick={(e) => e.stopPropagation()}
                          title="打开所在项目"
                        >
                          打开项目
                        </a>
                      ) : null}
                    </div>
                    {formatScheduleRange(it.start_at, it.end_at) ? (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-neutral-muted">
                        <span className="material-symbols-outlined text-xs">schedule</span>
                        {formatScheduleRange(it.start_at, it.end_at)}
                      </span>
                    ) : null}
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
