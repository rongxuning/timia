"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import {
  PriorityQuadrants,
  ScheduleCalendar,
  SwimlaneKanban,
  useCalendarWeeks,
  useItemsByPriority,
  type PriorityKey,
  type ScheduleTaskItem,
  type StatusKey,
} from "@/components/schedule";
import { primeProjectNameForBreadcrumb, primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { TaskDrawerWithComments, type TaskDrawerItem } from "@/components/TaskDrawerWithComments";
import { ProjectModal } from "@/components/ProjectModal";

type Workspace = { id: string; name: string; description?: string | null };
type Member = { id: string; user_id: string; email: string; display_name: string; role: string; status: string; is_creator?: boolean };
type Project = {
  id: string;
  name: string;
  description?: string | null;
  archived: boolean;
  created_at?: string;
  created_by_display_name?: string | null;
  can_manage?: boolean;
};
type TaskUserBrief = { id: string; display_name: string };

type Item = {
  id: string;
  title: string;
  body?: string | null;
  status: "todo" | "doing" | "done" | "archived" | string;
  priority?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: string | null;
  version: number;
  created_by?: TaskUserBrief | null;
  assignee?: TaskUserBrief | null;
  participants?: TaskUserBrief[];
  location?: string | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatYmdHm(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const { workspaceId, projectId } = params;
  const token = useMemo(() => getToken(), []);

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [createInitialStatus, setCreateInitialStatus] = useState<Item["status"]>("todo");
  const [taskCreateDrawerOpen, setTaskCreateDrawerOpen] = useState(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerItemId, setTaskDrawerItemId] = useState<string | null>(null);
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverPriority, setDragOverPriority] = useState<PriorityKey | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<StatusKey | null>(null);
  const [priorityCountdownNowMs, setPriorityCountdownNowMs] = useState(() => Date.now());
  const [editProjectOpen, setEditProjectOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setPriorityCountdownNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  async function reload() {
    if (!token) return;
    const [w, p, m, i] = await Promise.all([
      apiFetch<Workspace>(`/workspaces/${workspaceId}`, { token }).catch(() => null as any),
      apiFetch<Project>(`/workspaces/${workspaceId}/projects/${projectId}`, { token }),
      apiFetch<Member[]>(`/workspaces/${workspaceId}/projects/${projectId}/members`, { token }).catch(() => [] as Member[]),
      apiFetch<Item[]>(`/workspaces/${workspaceId}/projects/${projectId}/items`, { token }),
    ]);
    setWorkspace(w);
    setProject(p);
    setMembers(m);
    setItems(i);
    if (w) primeWorkspaceNameForBreadcrumb(w.id, w.name);
    primeProjectNameForBreadcrumb(workspaceId, p.id, p.name);
  }

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    reload().catch((e: any) => setError(e?.message ?? "加载失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, workspaceId, projectId]);

  const scheduleItems = useMemo(
    () =>
      items.map(
        (it): ScheduleTaskItem => ({
          ...it,
          workspace_id: workspaceId,
          workspace_name: workspace?.name ?? "",
          project_id: projectId,
          project_name: project?.name ?? "",
        }),
      ),
    [items, workspaceId, projectId, workspace?.name, project?.name],
  );

  const byStatus = scheduleItems.reduce(
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
  const activeCount = byStatus.doing.length;
  const backlogCount = byStatus.todo.length;
  const archivedCount = byStatus.archived.length;
  const healthPercent =
    taskTotal === 0 ? null : Math.round(((doneCount + archivedCount) / taskTotal) * 100);

  const activeMembers = members.filter((m) => m.status === "active");
  const projectOwnerMembers = activeMembers.filter((m) => m.role === "owner");
  const projectParticipantMembers = activeMembers.filter((m) => m.role === "member");

  const itemsByPriority = useItemsByPriority(scheduleItems);
  const calendarWeeks = useCalendarWeeks(scheduleItems, calendarMonth);

  function openTaskCreate(status: Item["status"] = "todo") {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
    setCreateInitialStatus(status);
    setTaskCreateDrawerOpen(true);
  }

  const taskDrawerListItem = useMemo(
    () => (taskDrawerItemId ? items.find((x) => x.id === taskDrawerItemId) ?? null : null),
    [items, taskDrawerItemId],
  );
  const taskDrawerSyncVersion = taskDrawerListItem?.version ?? 0;

  function handleTaskDrawerSaved(updated: TaskDrawerItem) {
    setItems((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
  }

  function handleTaskDrawerDeleted(deletedId: string) {
    setItems((prev) => prev.filter((x) => x.id !== deletedId));
    closeTaskDrawer();
  }

  function openDrawer(it: Item) {
    setTaskCreateDrawerOpen(false);
    setTaskDrawerItemId(it.id);
    setTaskDrawerOpen(true);
  }

  function closeTaskDrawer() {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
  }

  async function updateTaskPriority(itemId: string, newPriority: PriorityKey) {
    if (!token) return;
    const current = items.find((x) => x.id === itemId);
    if (!current) return;
    try {
      const updated = await apiFetch<Item>(
        `/workspaces/${workspaceId}/projects/${projectId}/items/${itemId}`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({
            version: current.version,
            priority: newPriority,
          }),
        },
      );
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e: any) {
      // keep UX simple: surface error banner
      setError(e?.message ?? "更新优先级失败");
    }
  }

  async function updateTaskStatus(itemId: string, newStatus: "todo" | "doing" | "done" | "archived") {
    if (!token) return;
    const current = items.find((x) => x.id === itemId);
    if (!current) return;
    if ((current.status as any) === newStatus) return;
    try {
      const updated = await apiFetch<Item>(
        `/workspaces/${workspaceId}/projects/${projectId}/items/${itemId}`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({
            version: current.version,
            status: newStatus,
          }),
        },
      );
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e: any) {
      setError(e?.message ?? "更新状态失败");
    }
  }

  return (
    <main className="px-lg py-lg">
      <div className="max-w-container-max mx-auto space-y-2xl">
        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-lg md:grid-cols-2 lg:grid-cols-[2fr_2.5fr_2fr_2fr] items-stretch">
          <div
            className={
              project?.can_manage
                ? "flex min-h-44 cursor-pointer flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                : "flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg"
            }
            role={project?.can_manage ? "button" : undefined}
            tabIndex={project?.can_manage ? 0 : undefined}
            aria-label={project?.can_manage ? "编辑项目名称与描述" : undefined}
            onClick={project?.can_manage ? () => setEditProjectOpen(true) : undefined}
            onKeyDown={
              project?.can_manage
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditProjectOpen(true);
                    }
                  }
                : undefined
            }
          >
            <span className="text-sm font-semibold text-primary">项目</span>
            <div className="space-y-1">
              <div className="font-subhead text-lg text-text-primary truncate">{project?.name ?? "—"}</div>
              <div className="text-small text-text-secondary truncate">{project?.description || "暂无描述。"}</div>
              <div className="text-caption text-neutral-muted">创建于 {project?.created_at ? formatYmdHm(project.created_at) : "—"}</div>
              <div className="text-caption text-neutral-muted">创建者 {project?.created_by_display_name ?? "—"}</div>
              {project?.can_manage ? (
                <div className="pt-1 text-caption text-primary">点击编辑名称与描述</div>
              ) : (
                <div className="pt-1 text-caption text-neutral-muted">仅项目/空间负责人可编辑项目信息</div>
              )}
            </div>
          </div>

          <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <span className="text-sm font-semibold text-primary">成员</span>
            <div className="space-y-2 mt-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-section-heading">{activeMembers.length}</span>
                <span className="text-text-secondary text-caption">总计</span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-caption text-neutral-muted">负责人（owner）{projectOwnerMembers.length}</div>
                <div className="flex -space-x-2">
                  {projectOwnerMembers.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                      title={m.display_name || m.email}
                    >
                      {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                    </div>
                  ))}
                  {projectOwnerMembers.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{projectOwnerMembers.length - 3}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-caption text-neutral-muted">成员 {projectParticipantMembers.length}</div>
                <div className="flex -space-x-2">
                  {projectParticipantMembers.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                      title={m.display_name || m.email}
                    >
                      {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                    </div>
                  ))}
                  {projectParticipantMembers.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{projectParticipantMembers.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <span className="text-sm font-semibold text-primary">项目健康度</span>
            <div className="space-y-3 mt-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-section-heading">
                  {healthPercent == null ? "—" : `${healthPercent}%`}
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-caption text-neutral-muted">待办</span>
                  <span className="font-bold text-lg text-text-primary tabular-nums">{backlogCount}</span>
                </div>
                <div className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="text-caption text-neutral-muted">进行中</span>
                  <span className="font-bold text-lg text-text-primary tabular-nums">{activeCount}</span>
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

          <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <span className="text-sm font-semibold text-primary">项目设置</span>
            <div className="grid grid-cols-1 gap-sm">
              <a
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 px-lg py-sm text-sm font-medium text-text-primary transition-all hover:bg-zinc-50"
                href={`/workspace/${workspaceId}/projects/${projectId}/members`}
              >
                <span className="material-symbols-outlined text-lg">person_add</span>
                添加成员
              </a>
              <button
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-lg py-sm text-sm font-semibold text-on-primary shadow-lg shadow-indigo-100 transition-all hover:bg-primary-hover hover:-translate-y-0.5"
                type="button"
                onClick={() => openTaskCreate("todo")}
              >
                <span className="material-symbols-outlined text-lg">add</span>
                新建任务
              </button>
            </div>
          </div>
        </section>

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
          showProjectContext={false}
        />

        <ScheduleCalendar
          calendarMonth={calendarMonth}
          onCalendarMonthChange={setCalendarMonth}
          weeks={calendarWeeks}
          onTaskClick={openDrawer}
          showProjectContext={false}
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
          onCreateInColumn={openTaskCreate}
          showAssigneeAvatar
          showProjectContext={false}
        />
      </div>

      <ProjectModal
        open={editProjectOpen && !!project?.can_manage}
        onClose={() => setEditProjectOpen(false)}
        workspaceId={workspaceId}
        token={token}
        mode="edit"
        projectId={projectId}
        initialName={project?.name ?? ""}
        initialDescription={project?.description}
        onSuccess={(updated) => {
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  name: updated.name,
                  description: updated.description ?? null,
                  archived: updated.archived ?? prev.archived,
                  created_at: updated.created_at ?? prev.created_at,
                  created_by_display_name: updated.created_by_display_name ?? prev.created_by_display_name,
                }
              : prev,
          );
          primeProjectNameForBreadcrumb(workspaceId, projectId, updated.name);
        }}
      />

      <TaskDrawerWithComments
        open={taskDrawerOpen && !!taskDrawerItemId}
        onClose={closeTaskDrawer}
        workspaceId={workspaceId}
        projectId={projectId}
        itemId={taskDrawerItemId}
        highlightCommentId={null}
        token={token}
        syncVersion={taskDrawerSyncVersion}
        onTaskSaved={handleTaskDrawerSaved}
        onTaskDeleted={handleTaskDrawerDeleted}
      />

      <TaskDrawerWithComments
        open={taskCreateDrawerOpen}
        onClose={() => setTaskCreateDrawerOpen(false)}
        workspaceId={workspaceId}
        projectId={projectId}
        itemId={null}
        highlightCommentId={null}
        token={token}
        variant="create"
        initialCreateStatus={createInitialStatus}
        onTaskCreated={(created) => setItems((prev) => [created as Item, ...prev])}
      />

    </main>
  );
}

