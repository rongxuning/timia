"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";

type Me = { id: string; email: string; display_name: string };

type MyItem = {
  id: string;
  title: string;
  body?: string | null;
  status: "todo" | "doing" | "done" | "archived" | string;
  priority?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: string | null;
  version: number;
  workspace_id: string;
  workspace_name: string;
  project_id: string;
  project_name: string;
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

function commentsUrlForItem(it: MyItem) {
  return `/workspaces/${it.workspace_id}/projects/${it.project_id}/items/${it.id}/comments`;
}

type StatusKey = "todo" | "doing" | "done" | "archived";
type PriorityKey = "1" | "2" | "3" | "4";

function normalizePriority(p?: string | null): PriorityKey {
  const v = (p ?? "").trim().toLowerCase();
  if (v === "1" || v === "2" || v === "3" || v === "4") return v;
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

function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localDayRangeFromItem(it: MyItem): { startKey: string; endKey: string } | null {
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

function wholeDaysBetweenInclusive(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

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
  item: MyItem;
  colStart: number;
  colSpan: number;
  lane: number;
  roundLeft: boolean;
  roundRight: boolean;
};

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

function toLocalDatetimeInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
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

const STATUSES: Array<{ key: StatusKey; label: string; dotClass: string; bgClass: string }> = [
  { key: "todo", label: "待办", dotClass: "bg-zinc-300", bgClass: "bg-white" },
  { key: "doing", label: "进行中", dotClass: "bg-indigo-600", bgClass: "bg-surface-container-low/30" },
  { key: "done", label: "已完成", dotClass: "bg-success", bgClass: "bg-white" },
  { key: "archived", label: "已归档", dotClass: "bg-zinc-400", bgClass: "bg-white" },
];

export default function MySchedulePage() {
  const router = useRouter();
  const token = useMemo(() => getToken(), []);

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<MyItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<MyItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editStatus, setEditStatus] = useState<StatusKey>("todo");
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
  const [dragOverPriority, setDragOverPriority] = useState<PriorityKey | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<StatusKey | null>(null);

  async function reload() {
    if (!token) return;
    const [meResp, list] = await Promise.all([
      apiFetch<Me>("/auth/me", { token }).catch(() => null as Me | null),
      apiFetch<MyItem[]>("/me/items", { token }),
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
    { todo: [] as MyItem[], doing: [] as MyItem[], done: [] as MyItem[], archived: [] as MyItem[] } as Record<
      StatusKey,
      MyItem[]
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

  const itemsByPriority = useMemo(() => {
    const out: Record<PriorityKey, MyItem[]> = { "1": [], "2": [], "3": [], "4": [] };
    for (const it of items) {
      // Priority quadrants should only show active work
      if (it.status === "done" || it.status === "archived") continue;
      out[normalizePriority(it.priority)].push(it);
    }
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

  function patchPath(it: { workspace_id: string; project_id: string; id: string }) {
    return `/workspaces/${it.workspace_id}/projects/${it.project_id}/items/${it.id}`;
  }

  function openDrawer(it: MyItem) {
    setDrawerItem(it);
    setEditTitle(it.title ?? "");
    setEditBody(it.body ?? "");
    setEditStatus((it.status as StatusKey) ?? "todo");
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

  useEffect(() => {
    if (!drawerOpen || !drawerItem || !token) return;
    let cancelled = false;
    setCommentsLoading(true);
    setCommentError(null);
    apiFetch<ItemComment[]>(commentsUrlForItem(drawerItem), { token })
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
  }, [drawerOpen, drawerItem?.id, drawerItem?.workspace_id, drawerItem?.project_id, token]);

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
      await apiFetch<ItemComment>(commentsUrlForItem(drawerItem), {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
      setNewCommentBody("");
      setReplyToCommentId(null);
      const list = await apiFetch<ItemComment[]>(commentsUrlForItem(drawerItem), { token });
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
      const updated = await apiFetch<ItemComment>(`${commentsUrlForItem(drawerItem)}/${commentId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ completion_status }),
      });
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
      const updated = await apiFetch<MyItem>(patchPath(drawerItem), {
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
      });
      const merged: MyItem = {
        ...drawerItem,
        ...updated,
        workspace_id: drawerItem.workspace_id,
        workspace_name: drawerItem.workspace_name,
        project_id: drawerItem.project_id,
        project_name: drawerItem.project_name,
      };
      setItems((prev) => prev.map((x) => (x.id === merged.id ? merged : x)));
      setDrawerItem(merged);
    } catch (e: any) {
      setEditError(e?.message ?? "保存失败");
    } finally {
      setEditLoading(false);
    }
  }

  async function updateTaskPriority(itemId: string, newPriority: PriorityKey) {
    if (!token) return;
    const current = items.find((x) => x.id === itemId);
    if (!current) return;
    try {
      const updated = await apiFetch<MyItem>(patchPath(current), {
        method: "PATCH",
        token,
        body: JSON.stringify({ version: current.version, priority: newPriority }),
      });
      const merged: MyItem = {
        ...current,
        ...updated,
        workspace_id: current.workspace_id,
        workspace_name: current.workspace_name,
        project_id: current.project_id,
        project_name: current.project_name,
      };
      setItems((prev) => prev.map((x) => (x.id === merged.id ? merged : x)));
      if (drawerItem?.id === merged.id) setDrawerItem(merged);
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
      const updated = await apiFetch<MyItem>(patchPath(current), {
        method: "PATCH",
        token,
        body: JSON.stringify({ version: current.version, status: newStatus }),
      });
      const merged: MyItem = {
        ...current,
        ...updated,
        workspace_id: current.workspace_id,
        workspace_name: current.workspace_name,
        project_id: current.project_id,
        project_name: current.project_name,
      };
      setItems((prev) => prev.map((x) => (x.id === merged.id ? merged : x)));
      if (drawerItem?.id === merged.id) setDrawerItem(merged);
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
                按登录人聚合，跨工作空间展示
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

        {/* Priority Quadrants */}
        <section className="bg-white rounded-xl border border-border-subtle overflow-hidden mb-lg">
          <div className="p-lg flex items-center justify-between gap-lg">
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
                            title={`${it.title} · ${it.workspace_name} / ${it.project_name}`}
                          >
                            <span className="truncate">{it.title}</span>
                            <span className="ml-2 text-[10px] text-neutral-muted">
                              {it.project_name}
                            </span>
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
        <section className="bg-white rounded-xl border border-border-subtle overflow-hidden mb-lg">
          <div className="p-lg flex items-center justify-between gap-lg">
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
                onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
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
                onClick={() => setCalendarMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
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
                    // 任务区：至少 3 行任务高度；随 lane 增多变高，不设上限（与 gap-y-1、pt-1、pb-2、gridAutoRows 一致）
                    const minTaskLanes = 3;
                    const lanes = Math.max(rowCount, minTaskLanes);
                    const taskAreaMinHeightPx =
                      4 + 8 + lanes * 22 + Math.max(0, lanes - 1) * 4;
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
                              // 固定任务行高：不随区域高度拉伸
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
                                  title={`${seg.item.title} · ${seg.item.workspace_name} / ${seg.item.project_name}`}
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
                          <div
                            className="pointer-events-none absolute inset-0 z-0 grid grid-cols-7"
                            aria-hidden
                          >
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

        {/* 泳道图（标题区）+ 看板 */}
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
                {byStatus[s.key].length === 0 ? (
                  <div className="text-[12px] text-neutral-muted">暂无任务。</div>
                ) : (
                  byStatus[s.key].map((it) => (
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
                <div className="text-caption text-neutral-muted truncate mt-1">
                  {drawerItem.workspace_name} / {drawerItem.project_name}
                </div>
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
                        onChange={(e) => setEditStatus(e.target.value as StatusKey)}
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
    </main>
  );
}
