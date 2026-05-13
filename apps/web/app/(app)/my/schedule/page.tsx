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
  toLocalDatetimeInputValue,
  type PriorityKey,
  type ScheduleTaskItem,
  type StatusKey,
} from "@/components/schedule";

type Me = { id: string; email: string; display_name: string };

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

function commentsUrlForItem(it: ScheduleTaskItem) {
  return `/workspaces/${it.workspace_id}/projects/${it.project_id}/items/${it.id}/comments`;
}

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

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<ScheduleTaskItem | null>(null);
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

  function openDrawer(it: ScheduleTaskItem) {
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
              <button
                type="button"
                role="switch"
                aria-checked={c.completion_status === "done"}
                aria-label="评论状态"
                className={[
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border-subtle transition-colors",
                  c.completion_status === "done" ? "bg-emerald-500" : "bg-zinc-300",
                ].join(" ")}
                onClick={() =>
                  patchCommentCompletion(c.id, c.completion_status === "done" ? "pending" : "done")
                }
              >
                <span
                  className={[
                    "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform",
                    c.completion_status === "done" ? "translate-x-5" : "translate-x-1",
                  ].join(" ")}
                />
              </button>
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
      const updated = await apiFetch<ScheduleTaskItem>(patchPath(drawerItem), {
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
      const merged: ScheduleTaskItem = {
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
        />
      </div>

      {/* Task Drawer */}
      {drawerOpen && drawerItem && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
          <aside className="absolute inset-y-0 right-0 w-[min(1120px,100vw)] bg-surface border-l border-border-subtle shadow-xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border-subtle">
              <div className="min-w-0">
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

            <div className="flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row">
              <div className="w-full min-h-0 min-w-0 overflow-y-auto px-6 py-6 border-b lg:flex-[0_0_40%] lg:border-b-0 lg:border-r border-border-subtle">
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

              <div className="flex w-full min-h-0 min-w-0 flex-col max-h-[48vh] lg:max-h-none lg:flex-[0_0_60%]">
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
