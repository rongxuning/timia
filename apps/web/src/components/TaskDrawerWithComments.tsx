"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

export type TaskDrawerItem = {
  id: string;
  title: string;
  body?: string | null;
  status: string;
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
  if (v === "low") return "2";
  if (v === "medium") return "3";
  if (v === "high") return "4";
  return "1";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalDatetimeInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

type DrawerVariant = "edit" | "create";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  projectId: string;
  /** 编辑已有任务时传入 id；`variant="create"` 时为 null */
  itemId: string | null;
  highlightCommentId: string | null;
  token: string | null;
  /** 默认 `edit`；`create` 为新建任务（不拉取 item、提交走 POST） */
  variant?: DrawerVariant;
  /**
   * 是否展示右侧评论区；默认在 `create` 下为 false，其余为 true。
   * 也可显式传入以覆盖。
   */
  showComments?: boolean;
  /** Optional second line under the title (e.g. workspace / project on 我的日程). */
  titleSubtitle?: string | null;
  /** Called after a successful task save so parent lists can refresh. */
  onTaskSaved?: (item: TaskDrawerItem) => void;
  /** Called after successful create (POST). Drawer will then call `onClose`. */
  onTaskCreated?: (item: TaskDrawerItem) => void;
  /** When this changes while open (e.g. list item `version` after drag), task is refetched. */
  syncVersion?: number;
  /** 新建任务时表单的初始状态（例如看板列「添加」） */
  initialCreateStatus?: string;
};

export function TaskDrawerWithComments({
  open,
  onClose,
  workspaceId,
  projectId,
  itemId,
  highlightCommentId,
  token,
  variant = "edit",
  showComments: showCommentsProp,
  titleSubtitle = null,
  onTaskSaved,
  onTaskCreated,
  syncVersion = 0,
  initialCreateStatus,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const effectiveShowComments = showCommentsProp ?? (variant !== "create");

  const [drawerItem, setDrawerItem] = useState<TaskDrawerItem | null>(null);
  const [itemLoading, setItemLoading] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editStatus, setEditStatus] = useState<string>("todo");
  const [editPriority, setEditPriority] = useState<string>("");
  const [editStartAt, setEditStartAt] = useState("");
  const [editEndAt, setEditEndAt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [comments, setComments] = useState<ItemComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [expandedCommentContent, setExpandedCommentContent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || variant !== "create") return;
    setDrawerItem(null);
    setEditTitle("");
    setEditBody("");
    setEditStatus(initialCreateStatus ?? "todo");
    setEditPriority("1");
    setEditStartAt("");
    setEditEndAt("");
    setEditError(null);
    setItemLoading(false);
  }, [open, variant, initialCreateStatus]);

  useEffect(() => {
    if (!open || variant !== "edit" || !itemId || !token) {
      if (!open) setDrawerItem(null);
      return;
    }
    let cancelled = false;
    setItemLoading(true);
    setEditError(null);
    apiFetch<TaskDrawerItem>(`/workspaces/${workspaceId}/projects/${projectId}/items/${itemId}`, { token })
      .then((it) => {
        if (cancelled) return;
        setDrawerItem(it);
        setEditTitle(it.title ?? "");
        setEditBody(it.body ?? "");
        setEditStatus((it.status as string) ?? "todo");
        setEditPriority(normalizePriority(it.priority));
        setEditStartAt(it.start_at ? toLocalDatetimeInputValue(it.start_at) : "");
        setEditEndAt(it.end_at ? toLocalDatetimeInputValue(it.end_at) : "");
      })
      .catch((e: any) => {
        if (!cancelled) setEditError(e?.message ?? "任务加载失败");
      })
      .finally(() => {
        if (!cancelled) setItemLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, variant, itemId, workspaceId, projectId, token, syncVersion]);

  useEffect(() => {
    if (!effectiveShowComments || !open || !drawerItem || !token) return;
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
  }, [open, drawerItem?.id, workspaceId, projectId, token, effectiveShowComments]);

  useEffect(() => {
    if (!effectiveShowComments || !open || !highlightCommentId || commentsLoading || comments.length === 0) return;
    let timeoutId: number | undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`task-comment-${highlightCommentId}`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("rounded-lg", "ring-2", "ring-primary/50", "ring-offset-2", "bg-primary-container/10");
        timeoutId = window.setTimeout(() => {
          el.classList.remove("rounded-lg", "ring-2", "ring-primary/50", "ring-offset-2", "bg-primary-container/10");
        }, 2400);
      }
    });
    return () => {
      cancelAnimationFrame(raf);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [open, highlightCommentId, commentsLoading, comments, effectiveShowComments]);

  useEffect(() => {
    if (!open) {
      setComments([]);
      setCommentError(null);
      setNewCommentBody("");
      setReplyToCommentId(null);
      setExpandedCommentContent({});
    }
  }, [open]);

  function closeDrawer() {
    if (editLoading) return;
    onClose();
  }

  async function onSaveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
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
      if (variant === "create") {
        const created = await apiFetch<TaskDrawerItem>(
          `/workspaces/${workspaceId}/projects/${projectId}/items`,
          {
            method: "POST",
            token,
            body: JSON.stringify({
              title,
              body: editBody.trim() || null,
              status: editStatus,
              priority: normalizePriority(editPriority),
              start_at: startIso,
              end_at: endIso,
              details: null,
            }),
          },
        );
        onTaskCreated?.(created);
        onClose();
      } else {
        if (!drawerItem) return;
        const updated = await apiFetch<TaskDrawerItem>(
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
        setDrawerItem(updated);
        onTaskSaved?.(updated);
      }
    } catch (e: any) {
      setEditError(e?.message ?? (variant === "create" ? "创建失败" : "保存失败"));
    } finally {
      setEditLoading(false);
    }
  }

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
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-neutral-muted shrink-0">状态</span>
            <select
              className="text-[12px] rounded-lg border border-border-subtle bg-surface-bright px-2 py-1 text-text-primary min-w-0 max-w-full"
              value={c.completion_status === "done" ? "done" : "pending"}
              onChange={(e) =>
                patchCommentCompletion(c.id, e.target.value === "done" ? "done" : "pending")
              }
              aria-label={depth === 0 ? "评论状态" : "回复状态"}
            >
              <option value="pending">未完成</option>
              <option value="done">已完成</option>
            </select>
          </div>
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

  if (!open) return null;
  if (variant === "edit" && !itemId) return null;
  if (variant === "create" && (!workspaceId || !projectId)) return null;

  const showForm = variant === "create" || !!drawerItem;
  const headerTitle =
    variant === "create"
      ? "新建任务"
      : itemLoading
        ? "加载中…"
        : drawerItem?.title ?? "—";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
      <aside className="absolute inset-y-0 right-0 w-[min(1120px,100vw)] bg-surface border-l border-border-subtle shadow-xl flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border-subtle">
          <div className="min-w-0">
            <div className="font-subhead text-subhead text-text-primary truncate">{headerTitle}</div>
            {titleSubtitle ? (
              <div className="mt-1 truncate text-caption text-neutral-muted">{titleSubtitle}</div>
            ) : null}
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

        {itemLoading && variant === "edit" && !drawerItem ? (
          <div className="p-6 text-caption text-neutral-muted">加载任务中…</div>
        ) : editError && variant === "edit" && !drawerItem ? (
          <div className="p-6 text-small text-error">{editError}</div>
        ) : showForm ? (
          <div
            className={
              effectiveShowComments
                ? "flex flex-1 min-h-0 flex-col lg:flex-row"
                : "flex flex-1 min-h-0 flex-col"
            }
          >
            <div
              className={
                effectiveShowComments
                  ? "flex-1 min-w-0 min-h-0 overflow-y-auto px-6 py-6 border-b lg:border-b-0 lg:border-r border-border-subtle"
                  : "flex-1 min-w-0 min-h-0 overflow-y-auto px-6 py-6"
              }
            >
              <form onSubmit={onSaveTask} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-title`}>
                    标题
                  </label>
                  <input
                    id={`${uid}-title`}
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    disabled={editLoading}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-body`}>
                    描述
                  </label>
                  <textarea
                    id={`${uid}-body`}
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none min-h-[120px] resize-none"
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    disabled={editLoading}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-status`}>
                      状态
                    </label>
                    <select
                      id={`${uid}-status`}
                      className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      disabled={editLoading}
                    >
                      <option value="todo">待办（todo）</option>
                      <option value="doing">进行中（doing）</option>
                      <option value="done">已完成（done）</option>
                      <option value="archived">已归档（archived）</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-pri`}>
                      优先级
                    </label>
                    <select
                      id={`${uid}-pri`}
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
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-start`}>
                      开始时间
                    </label>
                    <input
                      id={`${uid}-start`}
                      type="datetime-local"
                      className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                      value={editStartAt}
                      onChange={(e) => setEditStartAt(e.target.value)}
                      disabled={editLoading}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-end`}>
                      结束时间
                    </label>
                    <input
                      id={`${uid}-end`}
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
                    {editLoading
                      ? variant === "create"
                        ? "创建中…"
                        : "保存中…"
                      : variant === "create"
                        ? "创建"
                        : "保存"}
                  </button>
                </div>
              </form>
            </div>

            {effectiveShowComments ? (
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
            ) : null}
          </div>
        ) : null}
      </aside>
    </div>
  );
}
