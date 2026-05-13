"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { ScheduleTaskItem } from "@/components/schedule/types";
import { countdownTargetForItem, formatRemainDHM } from "@/components/schedule/taskUtils";
import { primeProjectNameForBreadcrumb, primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { TaskDrawerWithComments, type TaskDrawerItem } from "@/components/TaskDrawerWithComments";

type Workspace = { id: string; name: string; description?: string | null };
type Member = { id: string; user_id: string; email: string; display_name: string; role: string; status: string; is_creator?: boolean };
type Project = {
  id: string;
  name: string;
  description?: string | null;
  archived: boolean;
  created_at?: string;
  created_by_display_name?: string | null;
};
type Item = {
  id: string;
  title: string;
  body?: string | null;
  status: "todo" | "doing" | "done" | "archived" | string;
  priority?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  version: number;
};

function normalizePriority(p?: string | null): "1" | "2" | "3" | "4" {
  const v = (p ?? "").trim().toLowerCase();
  if (v === "1" || v === "2" || v === "3" || v === "4") return v;
  // Back-compat for legacy values
  if (v === "low") return "2";
  if (v === "medium") return "3";
  if (v === "high") return "4";
  return "1";
}

function priorityBadgeClass(p?: string | null) {
  const n = normalizePriority(p);
  if (n === "1") return "bg-blue-100 text-blue-700 ring-1 ring-blue-200";
  if (n === "2") return "bg-green-100 text-green-700 ring-1 ring-green-200";
  if (n === "3") return "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200";
  return "bg-red-100 text-red-700 ring-1 ring-red-200";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar day key (matches month grid cells). */
function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Inclusive local date range for a task; single day if no end or invalid range. */
function localDayRangeFromItem(it: Item): { startKey: string; endKey: string } | null {
  if (!it.start_at) return null;
  const s = new Date(it.start_at);
  if (Number.isNaN(s.getTime())) return null;
  const e = it.end_at ? new Date(it.end_at) : s;
  if (Number.isNaN(e.getTime())) return null;
  const dayStart = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const dayEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  if (dayEnd.getTime() < dayStart.getTime()) {
    const k = dayKeyLocal(dayStart);
    return { startKey: k, endKey: k };
  }
  return { startKey: dayKeyLocal(dayStart), endKey: dayKeyLocal(dayEnd) };
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Whole days from a (inclusive) to b (inclusive); expects local-midnight-normalized dates. */
function wholeDaysBetweenInclusive(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

/** Stable saturated colors per task id (deterministic, visually distinct). */
function taskCalendarColors(taskId: string): { bg: string; fg: string; border: string } {
  let h = 2166136261;
  for (let i = 0; i < taskId.length; i++) {
    h ^= taskId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  return {
    bg: `hsla(${hue}, 72%, 90%, 0.95)`,
    fg: `hsla(${hue}, 45%, 22%, 1)`,
    border: `hsla(${hue}, 58%, 42%, 1)`,
  };
}

type CalendarWeekSegment = {
  item: Item;
  colStart: number;
  colSpan: number;
  lane: number;
  roundLeft: boolean;
  roundRight: boolean;
};

function formatYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatYmdHm(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toLocalDatetimeInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatMdHm(d: Date) {
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatScheduleRange(startIso?: string | null, endIso?: string | null) {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() < s.getTime()) return null;
  const sameDay =
    s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
  return sameDay ? `${formatMdHm(s)}–${pad2(e.getHours())}:${pad2(e.getMinutes())}` : `${formatMdHm(s)}–${formatMdHm(e)}`;
}

const MONTHS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
] as const;

const STATUSES: Array<{ key: "todo" | "doing" | "done" | "archived"; label: string; dotClass: string; bgClass: string }> =
  [
    { key: "todo", label: "待办", dotClass: "bg-zinc-300", bgClass: "bg-white" },
    { key: "doing", label: "进行中", dotClass: "bg-indigo-600", bgClass: "bg-surface-container-low/30" },
    { key: "done", label: "已完成", dotClass: "bg-success", bgClass: "bg-white" },
    { key: "archived", label: "已归档", dotClass: "bg-zinc-400", bgClass: "bg-white" },
  ];

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
  const [dragOverPriority, setDragOverPriority] = useState<"1" | "2" | "3" | "4" | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<"todo" | "doing" | "done" | "archived" | null>(null);
  const [priorityCountdownNowMs, setPriorityCountdownNowMs] = useState(() => Date.now());

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

  const byStatus = items.reduce(
    (acc, it) => {
      const key = (it.status || "todo") as keyof typeof acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(it);
      return acc;
    },
    { todo: [] as Item[], doing: [] as Item[], done: [] as Item[], archived: [] as Item[] } as Record<
      "todo" | "doing" | "done" | "archived",
      Item[]
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
  const adminMembers = activeMembers.filter((m) => m.role === "owner" || m.role === "admin");
  const contributorMembers = activeMembers.filter((m) => m.role === "member" || m.role === "guest");

  const itemsByPriority = useMemo(() => {
    const out: Record<"1" | "2" | "3" | "4", Item[]> = { "1": [], "2": [], "3": [], "4": [] };
    for (const it of items) {
      if (it.status === "archived") continue;
      out[normalizePriority(it.priority)].push(it);
    }
    // recent first (fallback to title)
    for (const k of ["1", "2", "3", "4"] as const) {
      out[k].sort((a, b) => {
        const as = a.start_at ? new Date(a.start_at).getTime() : 0;
        const bs = b.start_at ? new Date(b.start_at).getTime() : 0;
        if (bs !== as) return bs - as;
        return (a.title || "").localeCompare(b.title || "");
      });
    }
    return out;
  }, [items]);

  const calendarWeeks = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());

    const weeks: Array<{ days: Array<{ date: Date; key: string; inMonth: boolean }>; segments: CalendarWeekSegment[] }> =
      [];

    for (let w = 0; w < 5; w++) {
      const weekDays: Array<{ date: Date; key: string; inMonth: boolean }> = [];
      for (let d = 0; d < 7; d++) {
        const idx = w * 7 + d;
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + idx);
        weekDays.push({
          date,
          key: dayKeyLocal(date),
          inMonth: date.getMonth() === month,
        });
      }

      const weekFirst = startOfLocalDay(weekDays[0].date);
      const weekLast = startOfLocalDay(weekDays[6].date);

      type RawSeg = Omit<CalendarWeekSegment, "lane">;
      const rawSegments: RawSeg[] = [];

      for (const it of items) {
        const range = localDayRangeFromItem(it);
        if (!range || !it.start_at) continue;
        const s = new Date(it.start_at);
        const e = it.end_at ? new Date(it.end_at) : s;
        if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
        const taskStart = startOfLocalDay(s);
        const taskEnd = startOfLocalDay(e);
        if (taskEnd.getTime() < taskStart.getTime()) continue;
        if (taskEnd.getTime() < weekFirst.getTime() || taskStart.getTime() > weekLast.getTime()) continue;

        const segStart = taskStart.getTime() < weekFirst.getTime() ? weekFirst : taskStart;
        const segEnd = taskEnd.getTime() > weekLast.getTime() ? weekLast : taskEnd;
        if (segStart.getTime() > segEnd.getTime()) continue;

        const colStart = wholeDaysBetweenInclusive(segStart, weekFirst) + 1;
        const colSpan = wholeDaysBetweenInclusive(segEnd, segStart) + 1;

        rawSegments.push({
          item: it,
          colStart,
          colSpan,
          roundLeft: dayKeyLocal(segStart) === range.startKey,
          roundRight: dayKeyLocal(segEnd) === range.endKey,
        });
      }

      rawSegments.sort((a, b) => {
        if (a.colStart !== b.colStart) return a.colStart - b.colStart;
        return b.colSpan - a.colSpan;
      });

      const lanes: Array<Array<{ s: number; e: number }>> = [];
      const segments: CalendarWeekSegment[] = [];

      for (const raw of rawSegments) {
        const cs = raw.colStart;
        const ce = raw.colStart + raw.colSpan - 1;
        let placed = false;
        for (let lane = 0; lane < 24; lane++) {
          const occupied = lanes[lane] ?? [];
          const conflict = occupied.some((r) => !(r.e < cs || r.s > ce));
          if (!conflict) {
            if (!lanes[lane]) lanes[lane] = [];
            lanes[lane].push({ s: cs, e: ce });
            segments.push({ ...raw, lane });
            placed = true;
            break;
          }
        }
        if (!placed) {
          const lane = lanes.length;
          lanes[lane] = [{ s: cs, e: ce }];
          segments.push({ ...raw, lane });
        }
      }

      weeks.push({ days: weekDays, segments });
    }

    return weeks;
  }, [items, calendarMonth]);

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

  function openDrawer(it: Item) {
    setTaskCreateDrawerOpen(false);
    setTaskDrawerItemId(it.id);
    setTaskDrawerOpen(true);
  }

  function closeTaskDrawer() {
    setTaskDrawerOpen(false);
    setTaskDrawerItemId(null);
  }

  async function updateTaskPriority(itemId: string, newPriority: "1" | "2" | "3" | "4") {
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
          <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <span className="text-sm font-semibold text-primary">项目</span>
            <div className="space-y-1">
              <div className="font-subhead text-lg text-text-primary truncate">{project?.name ?? "—"}</div>
              <div className="text-small text-text-secondary truncate">{project?.description || "暂无描述。"}</div>
              <div className="text-caption text-neutral-muted">创建于 {project?.created_at ? formatYmdHm(project.created_at) : "—"}</div>
              <div className="text-caption text-neutral-muted">创建者 {project?.created_by_display_name ?? "—"}</div>
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
                <div className="text-caption text-neutral-muted">管理员 {adminMembers.length}</div>
                <div className="flex -space-x-2">
                  {adminMembers.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                      title={m.display_name || m.email}
                    >
                      {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                    </div>
                  ))}
                  {adminMembers.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{adminMembers.length - 3}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="text-caption text-neutral-muted">贡献者 {contributorMembers.length}</div>
                <div className="flex -space-x-2">
                  {contributorMembers.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                      title={m.display_name || m.email}
                    >
                      {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                    </div>
                  ))}
                  {contributorMembers.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{contributorMembers.length - 3}
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

        {/* Priority Quadrants */}
        <section className="mb-lg overflow-hidden rounded-xl border border-border-subtle bg-white">
          <div className="flex items-center justify-between gap-lg p-lg">
            <div className="text-sm font-semibold text-primary">优先级象限</div>
          </div>

          <div className="p-lg pt-0">
            <div className="grid grid-cols-1 gap-lg md:grid-cols-2">
              {(
                [
                  { p: "1", title: "P1（低）", colorClass: "bg-blue-50 border-blue-100", dotClass: "bg-blue-500" },
                  { p: "2", title: "P2", colorClass: "bg-green-50 border-green-100", dotClass: "bg-green-500" },
                  { p: "3", title: "P3", colorClass: "bg-yellow-50 border-yellow-100", dotClass: "bg-yellow-500" },
                  { p: "4", title: "P4（高）", colorClass: "bg-red-50 border-red-100", dotClass: "bg-red-500" },
                ] as const
              ).map((q) => {
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
                      setDragOverPriority(q.p);
                    }}
                    onDragLeave={() => {
                      setDragOverPriority((cur) => (cur === q.p ? null : cur));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/task-id") || dragItemId;
                      setDragOverPriority(null);
                      setDragItemId(null);
                      if (!id) return;
                      updateTaskPriority(id, q.p);
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
                          const target = countdownTargetForItem(it as unknown as ScheduleTaskItem);
                          const cd = target ? formatRemainDHM(target.getTime(), priorityCountdownNowMs) : null;
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={() => openDrawer(it)}
                              draggable
                              onDragStart={(e) => {
                                setDragItemId(it.id);
                                e.dataTransfer.setData("text/task-id", it.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDragItemId(null);
                                setDragOverPriority(null);
                              }}
                              className="w-full rounded-lg border border-border-subtle bg-white/70 px-2 py-1.5 text-left text-[12px] text-text-primary transition-colors hover:bg-white"
                              title={cd ? `${it.title} · ${cd.text}` : it.title}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-2">
                                <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
                                {cd ? (
                                  <span
                                    className={[
                                      "shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold tabular-nums leading-none",
                                      cd.overdue
                                        ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                                        : priorityBadgeClass(it.priority),
                                    ].join(" ")}
                                  >
                                    {cd.text}
                                  </span>
                                ) : null}
                              </div>
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

        {/* Calendar */}
        <section className="mb-lg overflow-hidden rounded-xl border border-border-subtle bg-white">
          <div className="flex items-center justify-between gap-lg p-lg">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-primary">日历</div>
              <div className="font-subhead text-lg text-text-primary">
                {MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors"
                onClick={() =>
                  setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
                }
                title="上个月"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <button
                type="button"
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors"
                onClick={() => {
                  const d = new Date();
                  setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
                title="本月"
              >
                <span className="material-symbols-outlined text-[18px]">today</span>
              </button>
              <button
                type="button"
                className="w-10 h-10 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest transition-colors"
                onClick={() =>
                  setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
                }
                title="下个月"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>

          {(() => {
            const today = new Date();
            const todayKey = dayKeyLocal(today);

            return (
              <div className="bg-surface">
                <div className="grid grid-cols-7 border-t border-border-subtle bg-surface-container-lowest">
                  {["日", "一", "二", "三", "四", "五", "六"].map((d, di) => (
                    <div
                      key={d}
                      className={[
                        "p-lg text-center font-overline text-neutral-muted border-r border-b border-border-subtle",
                        di === 0 ? "border-l border-border-subtle" : "",
                        "last:border-r-0",
                      ].join(" ")}
                    >
                      {d}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col">
                  {calendarWeeks.map((week, wi) => {
                    const maxLane = week.segments.reduce((m, s) => Math.max(m, s.lane), -1);
                    const rowCount = maxLane < 0 ? 0 : maxLane + 1;
                    const minTaskLanes = 3;
                    const lanes = Math.max(rowCount, minTaskLanes);
                    const taskAreaMinHeightPx = 4 + 8 + lanes * 22 + Math.max(0, lanes - 1) * 4;
                    return (
                      <div key={wi} className="border-b border-border-subtle last:border-b-0 flex flex-col min-h-0">
                        <div className="grid grid-cols-7 shrink-0">
                          {week.days.map(({ date, key, inMonth }, di) => {
                            const isToday = key === todayKey;
                            return (
                              <div
                                key={key}
                                className={[
                                  "border-r border-b border-border-subtle p-2 min-h-[44px]",
                                  di === 0 ? "border-l border-border-subtle" : "",
                                  inMonth ? "bg-surface" : "bg-surface-container-low/60 text-neutral-muted opacity-60",
                                  isToday ? "bg-violet-200 ring-1 ring-violet-400 ring-inset z-[1]" : "",
                                  "last:border-r-0",
                                ].join(" ")}
                              >
                                <div className="flex items-start justify-between">
                                  <span className={inMonth ? "font-small font-medium text-text-primary" : "font-small"}>
                                    {date.getDate()}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="relative border-t border-border-subtle/70 bg-surface">
                          <div
                            className="relative z-[1] grid grid-cols-7 gap-x-0 gap-y-1 px-0 pb-2 pt-1"
                            style={{
                              gridAutoRows: 22,
                              minHeight: taskAreaMinHeightPx,
                            }}
                          >
                            {week.segments.map((seg) => {
                              const c = taskCalendarColors(seg.item.id);
                              const radius =
                                seg.roundLeft && seg.roundRight
                                  ? 8
                                  : seg.roundLeft
                                    ? "8px 0 0 8px"
                                    : seg.roundRight
                                      ? "0 8px 8px 0"
                                      : 0;
                              const showLabel = seg.roundLeft || seg.colStart === 1;
                              return (
                                <button
                                  key={`cal-${seg.item.id}-${wi}-${seg.colStart}-${seg.lane}`}
                                  type="button"
                                  onClick={() => openDrawer(seg.item)}
                                  title={seg.item.title}
                                  className="h-[22px] flex items-center text-left text-[11px] px-1.5 font-medium truncate border-solid hover:brightness-[0.97] transition-[filter] z-[2] shadow-sm"
                                  style={{
                                    gridColumn: `${seg.colStart} / span ${seg.colSpan}`,
                                    gridRow: seg.lane + 1,
                                    backgroundColor: c.bg,
                                    color: c.fg,
                                    borderColor: c.border,
                                    borderWidth: 1,
                                    borderLeftWidth: seg.roundLeft ? 4 : 1,
                                    borderRadius: radius,
                                  }}
                                >
                                  {showLabel ? seg.item.title : "\u00a0"}
                                </button>
                              );
                            })}
                          </div>
                          <div className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7" aria-hidden>
                            {[0, 1, 2, 3, 4, 5, 6].map((col) => (
                              <div
                                key={col}
                                className={[
                                  "border-r border-border-subtle",
                                  col === 0 ? "border-l border-border-subtle" : "",
                                  col === 6 ? "border-r-0" : "",
                                ].join(" ")}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </section>

        <section className="mb-lg overflow-hidden rounded-xl border border-border-subtle bg-white">
          <div className="border-b border-border-subtle p-lg">
            <div className="text-sm font-semibold text-primary">泳道图</div>
          </div>
          <div className="grid grid-cols-1 border-b border-border-subtle bg-zinc-50/50 md:grid-cols-2 xl:grid-cols-4">
                {STATUSES.map((s) => (
                  <div key={s.key} className="flex items-center justify-between border-r border-border-subtle p-lg last:border-r-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${s.dotClass}`} />
                      <span className="text-overline">{s.label}</span>
                      <span className="text-caption text-neutral-muted">({byStatus[s.key].length})</span>
                    </div>
                    <button
                      type="button"
                      className="material-symbols-outlined text-lg text-neutral-muted cursor-pointer hover:text-text-primary"
                      onClick={() => openTaskCreate(s.key)}
                      title="添加任务"
                    >
                      add
                    </button>
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
                      setDragOverStatus(s.key);
                    }}
                    onDragLeave={() => setDragOverStatus((cur) => (cur === s.key ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/task-id") || dragItemId;
                      setDragOverStatus(null);
                      setDragItemId(null);
                      if (!id) return;
                      updateTaskStatus(id, s.key);
                    }}
                  >
                    {byStatus[s.key].map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => openDrawer(it)}
                        draggable
                        onDragStart={(e) => {
                          setDragItemId(it.id);
                          e.dataTransfer.setData("text/task-id", it.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragItemId(null);
                          setDragOverStatus(null);
                        }}
                        className="block w-full cursor-pointer rounded-xl border border-border-subtle bg-white p-lg text-left transition-all hover:-translate-y-0.5 hover:shadow-lg"
                      >
                        <span
                          className={`px-2 py-0.5 text-[10px] rounded font-bold ${priorityBadgeClass(it.priority)}`}
                        >
                          P{normalizePriority(it.priority)}
                        </span>
                        <p className="text-small font-medium text-text-primary mt-2">{it.title}</p>
                        {it.body && <p className="text-caption text-neutral-muted mt-1 line-clamp-2">{it.body}</p>}
                        <div className="mt-4 flex items-center justify-between">
                          <div className="flex -space-x-1">
                            {members.slice(0, 1).map((m) => (
                              <div
                                key={m.id}
                                className="w-6 h-6 rounded-full border border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                                title={m.display_name || m.email}
                              >
                                {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                              </div>
                            ))}
                          </div>
                          {formatScheduleRange(it.start_at, it.end_at) && (
                            <span className="text-[10px] text-neutral-muted flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">schedule</span>
                              {formatScheduleRange(it.start_at, it.end_at)}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
          </div>
        </section>
      </div>

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

