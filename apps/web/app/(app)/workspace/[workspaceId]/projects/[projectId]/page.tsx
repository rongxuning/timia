"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Workspace = { id: string; name: string; description?: string | null };
type Member = { id: string; user_id: string; email: string; display_name: string; role: string; status: string };
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

type ItemComment = {
  id: string;
  author_user_id: string;
  author_display_name: string;
  body: string;
  created_at: string;
  deleted_at?: string | null;
  parent_comment_id: string | null;
  completion_status: string;
};

const COMMENT_BODY_PREVIEW_CHARS = 200;

function buildRepliesByParentId(flat: ItemComment[]) {
  const m = new Map<string, ItemComment[]>();
  for (const c of flat) {
    const pid = c.parent_comment_id;
    if (!pid) continue;
    if (!m.has(pid)) m.set(pid, []);
    m.get(pid)!.push(c);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return m;
}

function itemCommentsPath(workspaceId: string, projectId: string, itemId: string) {
  return `/workspaces/${workspaceId}/projects/${projectId}/items/${itemId}/comments`;
}

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
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBody, setCreateBody] = useState("");
  const [createStatus, setCreateStatus] = useState<Item["status"]>("todo");
  const [createPriority, setCreatePriority] = useState<"1" | "2" | "3" | "4">("1");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createStartAt, setCreateStartAt] = useState("");
  const [createEndAt, setCreateEndAt] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<Item | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editStatus, setEditStatus] = useState<Item["status"]>("todo");
  const [editPriority, setEditPriority] = useState<string>("");
  const [editStartAt, setEditStartAt] = useState<string>("");
  const [editEndAt, setEditEndAt] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [comments, setComments] = useState<ItemComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [expandedCommentContent, setExpandedCommentContent] = useState<Record<string, boolean>>({});
  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [dragOverPriority, setDragOverPriority] = useState<"1" | "2" | "3" | "4" | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<"todo" | "doing" | "done" | "archived" | null>(null);

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

  async function onCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const title = createTitle.trim();
    const body = createBody.trim();
    if (!title) {
      setCreateError("请输入任务标题");
      return;
    }
    if (!createStartAt || !createEndAt) {
      setCreateError("开始时间和结束时间为必填");
      return;
    }
    const startIso = new Date(createStartAt).toISOString();
    const endIso = new Date(createEndAt).toISOString();
    if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
      setCreateError("结束时间不能早于开始时间");
      return;
    }
    setCreateError(null);
    setCreateLoading(true);
    try {
      const created = await apiFetch<Item>(`/workspaces/${workspaceId}/projects/${projectId}/items`, {
        method: "POST",
        token,
        body: JSON.stringify({
          title,
          body: body || null,
          status: createStatus,
          priority: createPriority,
          start_at: startIso,
          end_at: endIso,
          details: null,
        }),
      });
      setItems((prev) => [created, ...prev]);
      setCreateOpen(false);
      setCreateTitle("");
      setCreateBody("");
      setCreateStatus("todo");
      setCreatePriority("1");
      setCreateStartAt("");
      setCreateEndAt("");
    } catch (e: any) {
      setCreateError(e?.message ?? "创建失败");
    } finally {
      setCreateLoading(false);
    }
  }

  function openDrawer(it: Item) {
    setDrawerItem(it);
    setEditTitle(it.title ?? "");
    setEditBody(it.body ?? "");
    setEditStatus((it.status as any) ?? "todo");
    setEditPriority(normalizePriority(it.priority));
    setEditStartAt(it.start_at ? toLocalDatetimeInputValue(it.start_at) : "");
    setEditEndAt(it.end_at ? toLocalDatetimeInputValue(it.end_at) : "");
    setEditError(null);
    setCommentError(null);
    setNewCommentBody("");
    setReplyToCommentId(null);
    setExpandedCommentContent({});
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (editLoading) return;
    setDrawerOpen(false);
    setDrawerItem(null);
    setComments([]);
    setCommentError(null);
    setNewCommentBody("");
    setReplyToCommentId(null);
    setExpandedCommentContent({});
  }

  async function onSaveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !drawerItem) return;
    const title = editTitle.trim();
    if (!title) {
      setEditError("请输入任务标题");
      return;
    }
    if (!editStartAt || !editEndAt) {
      setEditError("开始时间和结束时间为必填");
      return;
    }
    const startIso = new Date(editStartAt).toISOString();
    const endIso = new Date(editEndAt).toISOString();
    if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
      setEditError("结束时间不能早于开始时间");
      return;
    }

    setEditError(null);
    setEditLoading(true);
    try {
      const updated = await apiFetch<Item>(
        `/workspaces/${workspaceId}/projects/${projectId}/items/${drawerItem.id}`,
        {
          method: "PATCH",
          token,
          body: JSON.stringify({
            title,
            body: editBody.trim() || null,
            status: editStatus,
              priority: normalizePriority(editPriority),
            start_at: startIso,
            end_at: endIso,
            details: null,
            version: drawerItem.version,
          }),
        },
      );
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setDrawerItem(updated);
    } catch (e: any) {
      setEditError(e?.message ?? "保存失败");
    } finally {
      setEditLoading(false);
    }
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
      if (drawerItem?.id === updated.id) setDrawerItem(updated);
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
      if (drawerItem?.id === updated.id) setDrawerItem(updated);
    } catch (e: any) {
      setError(e?.message ?? "更新状态失败");
    }
  }

  useEffect(() => {
    if (!drawerOpen || !drawerItem || !token) return;
    let cancelled = false;
    setCommentsLoading(true);
    setCommentError(null);
    apiFetch<ItemComment[]>(itemCommentsPath(workspaceId, projectId, drawerItem.id), { token })
      .then((list) => {
        if (!cancelled) setComments(list);
      })
      .catch((e: any) => {
        if (!cancelled) setCommentError(e?.message ?? "评论加载失败");
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, drawerItem?.id, workspaceId, projectId, token]);

  async function submitNewComment(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !drawerItem) return;
    const body = newCommentBody.trim();
    if (!body) return;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      const payload: { body: string; parent_comment_id?: string } = { body };
      if (replyToCommentId) payload.parent_comment_id = replyToCommentId;
      await apiFetch<ItemComment>(itemCommentsPath(workspaceId, projectId, drawerItem.id), {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
      setNewCommentBody("");
      setReplyToCommentId(null);
      const list = await apiFetch<ItemComment[]>(
        itemCommentsPath(workspaceId, projectId, drawerItem.id),
        { token },
      );
      setComments(list);
    } catch (e: any) {
      setCommentError(e?.message ?? "发表评论失败");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function patchCommentCompletion(commentId: string, completion_status: "pending" | "done") {
    if (!token || !drawerItem) return;
    setCommentError(null);
    try {
      const updated = await apiFetch<ItemComment>(
        `${itemCommentsPath(workspaceId, projectId, drawerItem.id)}/${commentId}`,
        { method: "PATCH", token, body: JSON.stringify({ completion_status }) },
      );
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
    } catch (e: any) {
      setCommentError(e?.message ?? "更新评论状态失败");
    }
  }

  const repliesByParent = useMemo(() => buildRepliesByParentId(comments), [comments]);
  const rootCommentsSorted = useMemo(
    () =>
      comments
        .filter((c) => !c.parent_comment_id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [comments],
  );
  const replyTargetLabel = replyToCommentId
    ? comments.find((c) => c.id === replyToCommentId)?.author_display_name ?? "该评论"
    : null;

  function renderCommentNode(c: ItemComment, depth: number) {
    const replies = repliesByParent.get(c.id) ?? [];
    const isLong = c.body.length > COMMENT_BODY_PREVIEW_CHARS;
    const expanded = expandedCommentContent[c.id];
    const timeStr = new Date(c.created_at).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div
        key={c.id}
        id={`task-comment-${c.id}`}
        className={
          depth > 0
            ? "mt-3 pl-3 ml-1 border-l border-border-subtle scroll-mt-24"
            : "border-b border-border-subtle pb-4 mb-4 last:border-0 last:pb-0 last:mb-0 scroll-mt-24"
        }
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 text-caption text-neutral-muted">
          <span className="font-medium text-text-primary">{c.author_display_name || "用户"}</span>
          <span className="hidden sm:inline">·</span>
          <span>{timeStr}</span>
          {depth === 0 && (
            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="text-neutral-muted shrink-0">状态</span>
              <select
                className="text-[12px] rounded-lg border border-border-subtle bg-surface-bright px-2 py-1 text-text-primary min-w-0 max-w-full"
                value={c.completion_status === "done" ? "done" : "pending"}
                onChange={(e) =>
                  patchCommentCompletion(c.id, e.target.value === "done" ? "done" : "pending")
                }
                aria-label="评论状态"
              >
                <option value="pending">未完成</option>
                <option value="done">已完成</option>
              </select>
            </div>
          )}
        </div>
        <div className="mt-2 text-small text-text-primary">
          {isLong && !expanded ? (
            <>
              <p className="whitespace-pre-wrap line-clamp-4">{c.body}</p>
              <button
                type="button"
                className="mt-1 text-primary text-caption font-medium hover:underline"
                onClick={() =>
                  setExpandedCommentContent((prev) => ({ ...prev, [c.id]: true }))
                }
              >
                展开全文
              </button>
            </>
          ) : (
            <>
              <p className="whitespace-pre-wrap">{c.body}</p>
              {isLong && expanded && (
                <button
                  type="button"
                  className="mt-1 text-primary text-caption font-medium hover:underline"
                  onClick={() =>
                    setExpandedCommentContent((prev) => {
                      const next = { ...prev };
                      delete next[c.id];
                      return next;
                    })
                  }
                >
                  收起
                </button>
              )}
            </>
          )}
        </div>
        {depth === 0 && (
          <div className="mt-2">
            <button
              type="button"
              className="text-caption font-medium text-primary hover:underline"
              onClick={() => {
                setReplyToCommentId(c.id);
                setCommentError(null);
              }}
            >
              回复
            </button>
          </div>
        )}
        {replies.length > 0 && depth === 0 && (
          <div className="mt-2 space-y-0">{replies.map((r) => renderCommentNode(r, 1))}</div>
        )}
      </div>
    );
  }

  return (
    <main className="pt-8 pb-12 px-container-padding">
      <div className="max-w-container-max mx-auto">
        {/* Top blocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter mb-3xl">
          <section className="p-xl bg-white rounded-xl border border-border-subtle flex flex-col justify-between h-48 hover:shadow-lg transition-all">
            <span className="text-sm font-semibold text-primary">项目</span>
            <div className="space-y-1">
              <div className="font-subhead text-lg text-text-primary truncate">{project?.name ?? "—"}</div>
              <div className="text-small text-text-secondary line-clamp-2">{project?.description || "暂无描述。"}</div>
              <div className="text-caption text-neutral-muted">创建于 {project?.created_at ? formatYmdHm(project.created_at) : "—"}</div>
              <div className="text-caption text-neutral-muted">创建者 {project?.created_by_display_name ?? "—"}</div>
            </div>
          </section>

          <section className="p-xl bg-white rounded-xl border border-border-subtle flex flex-col justify-between h-48 hover:shadow-lg transition-all">
            <span className="text-sm font-semibold text-primary">成员</span>

            {members.length === 0 ? (
              <div className="text-small text-text-secondary">暂无成员。</div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="text-caption text-neutral-muted">共 {members.length} 人</div>
                <div className="flex -space-x-2">
                  {members.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                      title={m.display_name || m.email}
                    >
                      {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                    </div>
                  ))}
                  {members.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{members.length - 3}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <div className="p-xl bg-white rounded-xl border border-border-subtle flex flex-col justify-between h-48 hover:shadow-lg transition-all">
            <span className="text-sm font-semibold text-primary">项目健康度</span>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-section-heading">
                  {healthPercent == null ? "—" : `${healthPercent}%`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <div className="space-y-0.5">
                  <div className="text-caption text-neutral-muted">待办</div>
                  <div className="font-bold text-lg text-text-primary">{backlogCount}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-caption text-neutral-muted">进行中</div>
                  <div className="font-bold text-lg text-text-primary">{activeCount}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-caption text-neutral-muted">已完成</div>
                  <div className="font-bold text-lg text-text-primary">{doneCount}</div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-caption text-neutral-muted">已归档</div>
                  <div className="font-bold text-lg text-text-primary">{archivedCount}</div>
                </div>
              </div>
            </div>
          </div>

          <section className="p-xl bg-white rounded-xl border border-border-subtle flex flex-col justify-between h-48 hover:shadow-lg transition-all">
            <span className="text-sm font-semibold text-primary">设置</span>

            <div className="grid grid-cols-1 gap-sm">
              <a
                className="w-full px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
                href={`/workspace/${workspaceId}/projects/${projectId}/members`}
              >
                <span className="material-symbols-outlined text-lg">person_add</span>
                添加成员
              </a>
              <button
                className="w-full px-lg py-sm rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary-hover shadow-indigo-100 shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setCreateOpen(true);
                }}
              >
                <span className="material-symbols-outlined text-lg">add</span>
                新建任务
              </button>
            </div>
          </section>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {error}
          </div>
        )}

        {/* Priority Quadrants */}
        <section className="bg-white rounded-xl border border-border-subtle overflow-hidden mb-6">
          <div className="p-xl flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-primary">优先级象限</div>
          </div>

          <div className="p-xl pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      `rounded-xl border ${q.colorClass} p-4`,
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
                    <div className="flex items-center justify-between gap-3">
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
                        list.slice(0, 6).map((it) => (
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
                            className="w-full text-left rounded-lg bg-white/70 hover:bg-white border border-border-subtle px-2 py-1.5 text-[12px] text-text-primary truncate transition-colors"
                            title={it.title}
                          >
                            {it.title}
                          </button>
                        ))
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
        <section className="bg-white rounded-xl border border-border-subtle overflow-hidden mb-6">
          <div className="p-xl flex items-center justify-between gap-3">
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
                  {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
                    <div key={d} className="p-3 text-center font-overline text-neutral-muted">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col min-h-[520px]">
                  {calendarWeeks.map((week, wi) => {
                    const maxLane = week.segments.reduce((m, s) => Math.max(m, s.lane), -1);
                    const rowCount = maxLane < 0 ? 0 : maxLane + 1;
                    return (
                      <div key={wi} className="flex-1 border-b border-border-subtle last:border-b-0 flex flex-col min-h-0">
                        <div className="grid grid-cols-7 shrink-0">
                          {week.days.map(({ date, key, inMonth }) => {
                            const isToday = key === todayKey;
                            return (
                              <div
                                key={key}
                                className={[
                                  "border-r border-border-subtle p-2 min-h-[44px]",
                                  inMonth ? "bg-surface" : "bg-surface-container-low/60 text-neutral-muted opacity-60",
                                  isToday ? "ring-2 ring-primary/30 ring-inset z-[1]" : "",
                                  "last:border-r-0",
                                ].join(" ")}
                              >
                                <div className="flex items-start justify-between">
                                  <span className={inMonth ? "font-small font-medium text-text-primary" : "font-small"}>
                                    {date.getDate()}
                                  </span>
                                  {isToday && (
                                    <span
                                      className="material-symbols-outlined text-primary text-sm"
                                      style={{ fontVariationSettings: "'FILL' 1" }}
                                    >
                                      push_pin
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div
                          className="grid grid-cols-7 gap-x-0 gap-y-1 px-0 pb-2 pt-1 border-t border-border-subtle/70 bg-surface grow"
                          style={{
                            gridAutoRows: "minmax(22px, auto)",
                            minHeight: rowCount === 0 ? 6 : 6 + rowCount * 26,
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
                                key={`${seg.item.id}-${wi}-${seg.colStart}-${seg.lane}`}
                                type="button"
                                onClick={() => openDrawer(seg.item)}
                                title={seg.item.title}
                                className="text-left text-[11px] px-1.5 py-1 font-medium truncate border-solid hover:brightness-[0.97] transition-[filter] z-[2] shadow-sm"
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
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </section>

        <div className="bg-white rounded-xl border border-border-subtle overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 border-b border-border-subtle bg-zinc-50/50">
                {STATUSES.map((s) => (
                  <div key={s.key} className="p-4 border-r border-border-subtle last:border-r-0 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${s.dotClass}`} />
                      <span className="text-overline">{s.label}</span>
                      <span className="text-caption text-neutral-muted">({byStatus[s.key].length})</span>
                    </div>
                    <button
                      type="button"
                      className="material-symbols-outlined text-lg text-neutral-muted cursor-pointer hover:text-text-primary"
                      onClick={() => {
                        setCreateStatus(s.key);
                        setCreateError(null);
                        setCreateOpen(true);
                      }}
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
                      `p-4 space-y-4 overflow-y-auto ${s.bgClass}`,
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
                        className="w-full text-left bg-white border border-border-subtle rounded-xl p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer block"
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
        </div>
      </div>

      {/* Task Drawer */}
      {drawerOpen && drawerItem && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
          <aside className="absolute inset-y-0 right-0 w-[min(1120px,100vw)] bg-surface border-l border-border-subtle shadow-xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border-subtle">
              <div className="min-w-0">
                <div className="text-overline text-zinc-400">编辑任务</div>
                <div className="font-subhead text-subhead text-text-primary truncate">{drawerItem.title}</div>
              </div>
              <button
                type="button"
                className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest disabled:opacity-50"
                onClick={closeDrawer}
                disabled={editLoading}
                title="关闭"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
              <div className="flex-1 min-w-0 min-h-0 overflow-y-auto px-6 py-6 border-b lg:border-b-0 lg:border-r border-border-subtle">
                <form onSubmit={onSaveTask} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor="editTaskTitle">
                      标题
                    </label>
                    <input
                      id="editTaskTitle"
                      className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      disabled={editLoading}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor="editTaskBody">
                      描述
                    </label>
                    <textarea
                      id="editTaskBody"
                      className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none min-h-[120px] resize-none"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      disabled={editLoading}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-on-surface-variant" htmlFor="editTaskStatus">
                        状态
                      </label>
                      <select
                        id="editTaskStatus"
                        className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as any)}
                        disabled={editLoading}
                      >
                        <option value="todo">待办（todo）</option>
                        <option value="doing">进行中（doing）</option>
                        <option value="done">已完成（done）</option>
                        <option value="archived">已归档（archived）</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-on-surface-variant" htmlFor="editTaskPriority">
                        优先级
                      </label>
                      <select
                        id="editTaskPriority"
                        className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        disabled={editLoading}
                      >
                        <option value="1">1（低）</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4（高）</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-on-surface-variant" htmlFor="editTaskStartAt">
                        开始时间
                      </label>
                      <input
                        id="editTaskStartAt"
                        type="datetime-local"
                        className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                        value={editStartAt}
                        onChange={(e) => setEditStartAt(e.target.value)}
                        disabled={editLoading}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-on-surface-variant" htmlFor="editTaskEndAt">
                        结束时间
                      </label>
                      <input
                        id="editTaskEndAt"
                        type="datetime-local"
                        className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                        value={editEndAt}
                        onChange={(e) => setEditEndAt(e.target.value)}
                        disabled={editLoading}
                        required
                      />
                    </div>
                  </div>

                  {editError && <div className="text-small text-error">{editError}</div>}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      className="text-sm rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-50"
                      onClick={closeDrawer}
                      disabled={editLoading}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className="text-sm rounded-xl bg-primary text-on-primary px-4 py-2 disabled:opacity-50"
                      disabled={editLoading}
                    >
                      {editLoading ? "保存中…" : "保存"}
                    </button>
                  </div>
                </form>
              </div>

              <div className="flex w-full flex-col lg:w-[min(440px,42%)] shrink-0 min-h-0 max-h-[48vh] lg:max-h-none">
                <div className="shrink-0 px-6 pt-4">
                  <div className="text-overline text-zinc-400">任务评论</div>
                </div>
                <form
                  onSubmit={submitNewComment}
                  className="shrink-0 px-6 py-4 border-b border-border-subtle space-y-3"
                >
                  {replyToCommentId && (
                    <div className="flex items-center justify-between gap-2 rounded-xl bg-primary-container/15 px-3 py-2 text-caption text-text-primary">
                      <span className="min-w-0 truncate">正在回复：{replyTargetLabel}</span>
                      <button
                        type="button"
                        className="shrink-0 text-primary font-medium hover:underline"
                        onClick={() => setReplyToCommentId(null)}
                      >
                        取消回复
                      </button>
                    </div>
                  )}
                  <textarea
                    className="w-full min-h-[88px] rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-small text-text-primary focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none resize-y"
                    placeholder="写下评论…"
                    value={newCommentBody}
                    onChange={(e) => setNewCommentBody(e.target.value)}
                    disabled={commentSubmitting}
                    aria-label="新评论"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="text-sm rounded-xl bg-primary text-on-primary px-4 py-2 font-semibold disabled:opacity-50"
                      disabled={commentSubmitting || !newCommentBody.trim()}
                    >
                      {commentSubmitting ? "提交中…" : "发表评论"}
                    </button>
                  </div>
                </form>
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
                  {commentsLoading && (
                    <div className="text-caption text-neutral-muted">加载评论中…</div>
                  )}
                  {commentError && <div className="text-small text-error mb-3">{commentError}</div>}
                  {!commentsLoading && rootCommentsSorted.length === 0 && !commentError && (
                    <div className="text-caption text-neutral-muted">暂无评论。</div>
                  )}
                  {rootCommentsSorted.map((c) => renderCommentNode(c, 0))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Create Task Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!createLoading) setCreateOpen(false);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="flex items-center justify-between">
                <div className="font-semibold font-subhead">新建任务</div>
                <button
                  className="text-sm underline"
                  type="button"
                  onClick={() => {
                    if (!createLoading) setCreateOpen(false);
                  }}
                >
                  关闭
                </button>
              </div>

              <form onSubmit={onCreateTask} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="createTaskTitle">
                    标题
                  </label>
                  <input
                    id="createTaskTitle"
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="例如：完善日程周视图"
                    autoFocus
                    disabled={createLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="createTaskBody">
                    描述
                  </label>
                  <textarea
                    id="createTaskBody"
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none min-h-[96px] resize-none"
                    value={createBody}
                    onChange={(e) => setCreateBody(e.target.value)}
                    placeholder="需要完成什么？"
                    disabled={createLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="createTaskStatus">
                    状态
                  </label>
                  <select
                    id="createTaskStatus"
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as any)}
                    disabled={createLoading}
                  >
                    <option value="todo">待办（todo）</option>
                    <option value="doing">进行中（doing）</option>
                    <option value="done">已完成（done）</option>
                    <option value="archived">已归档（archived）</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="createTaskPriority">
                    优先级
                  </label>
                  <select
                    id="createTaskPriority"
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value as any)}
                    disabled={createLoading}
                  >
                    <option value="1">1（低）</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4（高）</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor="createTaskStartAt">
                      开始时间
                    </label>
                    <input
                      id="createTaskStartAt"
                      type="datetime-local"
                      className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                      value={createStartAt}
                      onChange={(e) => setCreateStartAt(e.target.value)}
                      disabled={createLoading}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor="createTaskEndAt">
                      结束时间
                    </label>
                    <input
                      id="createTaskEndAt"
                      type="datetime-local"
                      className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                      value={createEndAt}
                      onChange={(e) => setCreateEndAt(e.target.value)}
                      disabled={createLoading}
                      required
                    />
                  </div>
                </div>

                {createError && <div className="text-small text-error">{createError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="text-sm rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-50"
                    onClick={() => setCreateOpen(false)}
                    disabled={createLoading}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="text-sm rounded-xl bg-primary text-on-primary px-4 py-2 disabled:opacity-50"
                    disabled={createLoading}
                  >
                    {createLoading ? "创建中…" : "创建"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

