"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import {
  PriorityQuadrants,
  ScheduleCalendar,
  SwimlaneKanban,
  useCalendarWeeks,
  useItemsByPriority,
  normalizePriority,
  type PriorityKey,
  type ScheduleTaskItem,
  type StatusKey,
} from "@/components/schedule";
import { TaskDrawerWithComments, type TaskDrawerItem } from "@/components/TaskDrawerWithComments";

type Me = { id: string; email: string; display_name: string };

export default function MySchedulePage() {
  const router = useRouter();
  const token = useMemo(() => getToken(), []);

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<ScheduleTaskItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerWorkspaceId, setTaskDrawerWorkspaceId] = useState("");
  const [taskDrawerProjectId, setTaskDrawerProjectId] = useState("");
  const [taskDrawerItemId, setTaskDrawerItemId] = useState<string | null>(null);

  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverPriority, setDragOverPriority] = useState<PriorityKey | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<StatusKey | null>(null);

  const [priorityCountdownNowMs, setPriorityCountdownNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setPriorityCountdownNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  async function reload() {
    if (!token) return;
    const [meResp, list] = await Promise.all([
      apiFetch<Me>("/auth/me", { token }).catch(() => null as Me | null),
      apiFetch<ScheduleTaskItem[]>("/me/items", { token }),
    ]);
    setMe(meResp);
    setItems(list);
  }

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    reload()
      .catch((e: any) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const byStatus = items.reduce(
    (acc, it) => {
      const key = (it.status || "todo") as StatusKey;
      if (!acc[key]) acc[key] = [];
      acc[key].push(it);
      return acc;
    },
    { todo: [] as ScheduleTaskItem[], doing: [] as ScheduleTaskItem[], done: [] as ScheduleTaskItem[], archived: [] as ScheduleTaskItem[] } as Record<
      StatusKey,
      ScheduleTaskItem[]
    >,
  );

  const taskTotal = items.length;
  const doneCount = byStatus.done.length;
  const doingCount = byStatus.doing.length;
  const todoCount = byStatus.todo.length;
  const archivedCount = byStatus.archived.length;
  const healthPercent =
    taskTotal === 0 ? null : Math.round(((doneCount + archivedCount) / taskTotal) * 100);

  const workspaceCount = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(it.workspace_id);
    return set.size;
  }, [items]);
  const projectCount = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(`${it.workspace_id}:${it.project_id}`);
    return set.size;
  }, [items]);

  const itemsByPriority = useItemsByPriority(items);
  const calendarWeeks = useCalendarWeeks(items, calendarMonth);

  function patchPath(it: { workspace_id: string; project_id: string; id: string }) {
    return `/workspaces/${it.workspace_id}/projects/${it.project_id}/items/${it.id}`;
  }

  const taskDrawerListItem = useMemo(
    () => (taskDrawerItemId ? items.find((x) => x.id === taskDrawerItemId) ?? null : null),
    [items, taskDrawerItemId],
  );
  const taskDrawerTitleSubtitle = taskDrawerListItem
    ? `${taskDrawerListItem.workspace_name} / ${taskDrawerListItem.project_name}`
    : null;
  const taskDrawerSyncVersion = taskDrawerListItem?.version ?? 0;

  function handleTaskDrawerSaved(updated: TaskDrawerItem) {
    setItems((prev) =>
      prev.map((x) =>
        x.id !== updated.id
          ? x
          : {
              ...x,
              ...updated,
              workspace_id: x.workspace_id,
              workspace_name: x.workspace_name,
              project_id: x.project_id,
              project_name: x.project_name,
            },
      ),
    );
  }

  function handleTaskDrawerDeleted(deletedId: string) {
    setItems((prev) => prev.filter((x) => x.id !== deletedId));
    closeTaskDrawer();
  }

  function openDrawer(it: ScheduleTaskItem) {
    setTaskDrawerWorkspaceId(it.workspace_id);
    setTaskDrawerProjectId(it.project_id);
    setTaskDrawerItemId(it.id);
    setTaskDrawerOpen(true);
  }

  function closeTaskDrawer() {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    setTaskDrawerWorkspaceId("");
    setTaskDrawerProjectId("");
  }

  async function updateTaskPriority(itemId: string, newPriority: PriorityKey) {
    if (!token) return;
    const current = items.find((x) => x.id === itemId);
    if (!current) return;
    try {
      const updated = await apiFetch<ScheduleTaskItem>(patchPath(current), {
        method: "PATCH",
        token,
        body: JSON.stringify({ version: current.version, priority: newPriority }),
      });
      const merged: ScheduleTaskItem = {
        ...current,
        ...updated,
        workspace_id: current.workspace_id,
        workspace_name: current.workspace_name,
        project_id: current.project_id,
        project_name: current.project_name,
      };
      setItems((prev) => prev.map((x) => (x.id === merged.id ? merged : x)));
    } catch (e: any) {
      setError(e?.message ?? "更新优先级失败");
    }
  }

  async function updateTaskStatus(itemId: string, newStatus: StatusKey) {
    if (!token) return;
    const current = items.find((x) => x.id === itemId);
    if (!current) return;
    if ((current.status as StatusKey) === newStatus) return;
    try {
      const updated = await apiFetch<ScheduleTaskItem>(patchPath(current), {
        method: "PATCH",
        token,
        body: JSON.stringify({ version: current.version, status: newStatus }),
      });
      const merged: ScheduleTaskItem = {
        ...current,
        ...updated,
        workspace_id: current.workspace_id,
        workspace_name: current.workspace_name,
        project_id: current.project_id,
        project_name: current.project_name,
      };
      setItems((prev) => prev.map((x) => (x.id === merged.id ? merged : x)));
    } catch (e: any) {
      setError(e?.message ?? "更新状态失败");
    }
  }

  return (
    <main className="px-lg py-lg">
      <div className="max-w-container-max mx-auto">
        {/* Top blocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg mb-lg">
          <section className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
            <span className="text-sm font-semibold text-primary">我的日程</span>
            <div className="w-full min-w-0 space-y-1 text-left">
              <div className="font-subhead text-lg text-text-primary truncate">{me?.display_name ?? "—"}</div>
              <div className="text-small text-text-secondary truncate">{me?.email ?? "—"}</div>
              <div className="text-caption text-neutral-muted">
                仅展示你负责或参与的任务，跨工作空间聚合
              </div>
            </div>
          </section>

          <section className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
            <span className="text-sm font-semibold text-primary">覆盖范围</span>
            <div className="flex w-full min-w-0 flex-col items-start gap-2 text-left">
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-section-heading">{workspaceCount}</span>
                <span className="text-text-secondary text-caption">个工作空间</span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-caption text-neutral-muted">项目数</span>
                  <span className="font-bold text-text-primary tabular-nums">{projectCount}</span>
                </div>
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-caption text-neutral-muted">任务总数</span>
                  <span className="font-bold text-text-primary tabular-nums">{items.length}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="flex h-44 flex-col items-start justify-start gap-lg rounded-xl border border-border-subtle bg-white p-lg hover:shadow-lg transition-all">
            <span className="text-sm font-semibold text-primary">健康度</span>
            <div className="flex w-full min-w-0 flex-col items-start gap-2 text-left">
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-section-heading">
                  {healthPercent == null ? "—" : `${healthPercent}%`}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-caption text-neutral-muted">待办</span>
                  <span className="font-bold text-lg text-text-primary tabular-nums">{todoCount}</span>
                </div>
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-caption text-neutral-muted">进行中</span>
                  <span className="font-bold text-lg text-text-primary tabular-nums">{doingCount}</span>
                </div>
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-caption text-neutral-muted">已完成</span>
                  <span className="font-bold text-lg text-text-primary tabular-nums">{doneCount}</span>
                </div>
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-caption text-neutral-muted">已归档</span>
                  <span className="font-bold text-lg text-text-primary tabular-nums">{archivedCount}</span>
                </div>
              </div>
            </div>
          </div>

        </div>

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
          onItemClick={openDrawer}
          onDropPriority={updateTaskPriority}
        />

        <ScheduleCalendar
          calendarMonth={calendarMonth}
          onCalendarMonthChange={setCalendarMonth}
          weeks={calendarWeeks}
          onTaskClick={openDrawer}
        />

        <SwimlaneKanban
          byStatus={byStatus}
          dragOverStatus={dragOverStatus}
          dragItemId={dragItemId}
          onDragItemIdChange={setDragItemId}
          onDragOverStatusChange={setDragOverStatus}
          onDragLeaveStatusColumn={(s) => setDragOverStatus((cur) => (cur === s ? null : cur))}
          onItemClick={openDrawer}
          onDropStatus={updateTaskStatus}
          showAssigneeAvatar
        />
      </div>

      <TaskDrawerWithComments
        open={taskDrawerOpen && !!taskDrawerWorkspaceId && !!taskDrawerProjectId && !!taskDrawerItemId}
        onClose={closeTaskDrawer}
        workspaceId={taskDrawerWorkspaceId}
        projectId={taskDrawerProjectId}
        itemId={taskDrawerItemId}
        highlightCommentId={null}
        token={token}
        titleSubtitle={taskDrawerTitleSubtitle}
        syncVersion={taskDrawerSyncVersion}
        onTaskSaved={handleTaskDrawerSaved}
        onTaskDeleted={handleTaskDrawerDeleted}
      />
    </main>
  );
}
