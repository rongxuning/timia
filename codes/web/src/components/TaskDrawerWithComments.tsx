"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  primeProjectNameForBreadcrumb,
  primeWorkspaceNameForBreadcrumb,
} from "@/components/Breadcrumbs";
import { apiFetch } from "@/lib/api";
import { fetchItemDetail, fetchTaskDrawerContext } from "@/lib/api/task-views";

export type TaskUserBrief = {
  id: string;
  display_name: string;
};

export type TaskDrawerItem = {
  id: string;
  title: string;
  body?: string | null;
  status: string;
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

type Me = { id: string; display_name?: string; email?: string };

type ProjectMemberRow = {
  user_id: string;
  display_name: string;
  email: string;
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

function mergeMemberOptions(
  me: Me | null,
  rows: ProjectMemberRow[],
  extraUsers: TaskUserBrief[],
): ProjectMemberRow[] {
  const byId = new Map<string, ProjectMemberRow>();
  for (const r of rows) {
    byId.set(r.user_id, r);
  }
  if (me?.id && !byId.has(me.id)) {
    byId.set(me.id, {
      user_id: me.id,
      display_name: me.display_name?.trim() || me.email || "我",
      email: me.email ?? "",
    });
  }
  for (const u of extraUsers) {
    if (!u?.id || byId.has(u.id)) continue;
    byId.set(u.id, { user_id: u.id, display_name: u.display_name || u.id, email: "" });
  }
  return Array.from(byId.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "zh-CN"),
  );
}

function memberMatchesQuery(m: ProjectMemberRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return m.display_name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s);
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
  /** Called after successful delete (DELETE). Drawer will then call `onClose`. */
  onTaskDeleted?: (itemId: string) => void;
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
  onTaskDeleted,
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
  const [editAssigneeUserId, setEditAssigneeUserId] = useState("");
  const [editParticipantUserIds, setEditParticipantUserIds] = useState<string[]>([]);
  const [editLocation, setEditLocation] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState("");
  const [assigneePanelOpen, setAssigneePanelOpen] = useState(false);
  const [participantSearchQuery, setParticipantSearchQuery] = useState("");
  const [participantPanelOpen, setParticipantPanelOpen] = useState(false);
  const [participantStagingIds, setParticipantStagingIds] = useState<string[]>([]);

  const assigneePickerRef = useRef<HTMLDivElement | null>(null);
  const participantPickerRef = useRef<HTMLDivElement | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [projectMembersRaw, setProjectMembersRaw] = useState<ProjectMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [contextWorkspaceName, setContextWorkspaceName] = useState<string | null>(null);
  const [contextProjectName, setContextProjectName] = useState<string | null>(null);

  const [comments, setComments] = useState<ItemComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [expandedCommentContent, setExpandedCommentContent] = useState<Record<string, boolean>>({});
  const [commentDeletingId, setCommentDeletingId] = useState<string | null>(null);

  const extraBriefsForOptions = useMemo(() => {
    const list: TaskUserBrief[] = [];
    if (drawerItem?.assignee) list.push(drawerItem.assignee);
    if (drawerItem?.created_by) list.push(drawerItem.created_by);
    for (const p of drawerItem?.participants ?? []) list.push(p);
    return list;
  }, [drawerItem]);

  const memberOptions = useMemo(
    () => mergeMemberOptions(me, projectMembersRaw, extraBriefsForOptions),
    [me, projectMembersRaw, extraBriefsForOptions],
  );

  const memberById = useMemo(() => {
    const m = new Map<string, ProjectMemberRow>();
    for (const x of memberOptions) m.set(x.user_id, x);
    return m;
  }, [memberOptions]);

  const filteredAssigneeCandidates = useMemo(
    () => memberOptions.filter((row) => memberMatchesQuery(row, assigneeSearchQuery)),
    [memberOptions, assigneeSearchQuery],
  );

  const filteredParticipantCandidates = useMemo(
    () =>
      memberOptions.filter((row) => {
        if (row.user_id === editAssigneeUserId) return false;
        if (editParticipantUserIds.includes(row.user_id)) return false;
        return memberMatchesQuery(row, participantSearchQuery);
      }),
    [memberOptions, participantSearchQuery, editAssigneeUserId, editParticipantUserIds],
  );

  useEffect(() => {
    if (!assigneePanelOpen && !participantPanelOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (assigneePickerRef.current?.contains(t)) return;
      if (participantPickerRef.current?.contains(t)) return;
      setAssigneePanelOpen(false);
      setParticipantPanelOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [assigneePanelOpen, participantPanelOpen]);

  useEffect(() => {
    if (!open || !token || !workspaceId || !projectId) {
      if (!open) {
        setProjectMembersRaw([]);
        setMembersError(null);
        setMe(null);
        setContextWorkspaceName(null);
        setContextProjectName(null);
      }
      return;
    }
    let cancelled = false;
    setMembersLoading(true);
    setMembersError(null);
    fetchTaskDrawerContext(token, workspaceId, projectId)
      .then((ctx) => {
        if (cancelled) return;
        setMe({ id: ctx.current_user_id, display_name: ctx.current_user_display_name });
        setProjectMembersRaw(
          ctx.member_options.map((m) => ({
            user_id: m.user_id,
            display_name: m.display_name,
            email: m.email,
          })),
        );
        primeWorkspaceNameForBreadcrumb(ctx.workspace_id, ctx.workspace_name);
        primeProjectNameForBreadcrumb(ctx.workspace_id, ctx.project_id, ctx.project_name);
        setContextWorkspaceName(ctx.workspace_name);
        setContextProjectName(ctx.project_name);
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setMembersError(e?.message ?? "上下文加载失败");
      })
      .finally(() => {
        if (!cancelled) setMembersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, workspaceId, projectId]);

  function applyItemToForm(it: TaskDrawerItem) {
    setDrawerItem(it);
    setEditTitle(it.title ?? "");
    setEditBody(it.body ?? "");
    setEditStatus((it.status as string) ?? "todo");
    setEditPriority(normalizePriority(it.priority));
    setEditStartAt(it.start_at ? toLocalDatetimeInputValue(it.start_at) : "");
    setEditEndAt(it.end_at ? toLocalDatetimeInputValue(it.end_at) : "");
    const assigneeId = it.assignee?.id ?? it.created_by?.id ?? "";
    setEditAssigneeUserId(assigneeId);
    setEditParticipantUserIds((it.participants ?? []).map((p) => p.id));
    setEditLocation(it.location ?? "");
    setAssigneeSearchQuery("");
    setParticipantSearchQuery("");
    setParticipantStagingIds([]);
    setAssigneePanelOpen(false);
    setParticipantPanelOpen(false);
  }

  useEffect(() => {
    if (!open || variant !== "create") return;
    setDrawerItem(null);
    setEditTitle("");
    setEditBody("");
    setEditStatus(initialCreateStatus ?? "todo");
    setEditPriority("1");
    setEditStartAt("");
    setEditEndAt("");
    setEditAssigneeUserId("");
    setEditParticipantUserIds([]);
    setEditLocation("");
    setEditError(null);
    setItemLoading(false);
    setComments([]);
    setAssigneeSearchQuery("");
    setParticipantSearchQuery("");
    setParticipantStagingIds([]);
    setAssigneePanelOpen(false);
    setParticipantPanelOpen(false);
  }, [open, variant, initialCreateStatus]);

  useEffect(() => {
    if (!open || variant !== "edit" || !itemId || !token) {
      if (!open) setDrawerItem(null);
      return;
    }
    let cancelled = false;
    setItemLoading(true);
    setCommentsLoading(true);
    setEditError(null);
    setCommentError(null);
    fetchItemDetail(token, workspaceId, projectId, itemId)
      .then((detail) => {
        if (cancelled) return;
        const { comments: detailComments, ...item } = detail;
        applyItemToForm(item);
        setComments(detailComments);
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setEditError(e?.message ?? "任务加载失败");
      })
      .finally(() => {
        if (!cancelled) {
          setItemLoading(false);
          setCommentsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, variant, itemId, workspaceId, projectId, token, syncVersion]);

  useEffect(() => {
    if (variant !== "create" || !open || editAssigneeUserId || !me?.id) return;
    setEditAssigneeUserId(me.id);
  }, [variant, open, me?.id, editAssigneeUserId]);

  useEffect(() => {
    if (!editAssigneeUserId) return;
    setEditParticipantUserIds((prev) => prev.filter((id) => id !== editAssigneeUserId));
    setParticipantStagingIds((prev) => prev.filter((id) => id !== editAssigneeUserId));
  }, [editAssigneeUserId]);

  async function refreshComments() {
    if (!token || !drawerItem) return;
    const detail = await fetchItemDetail(token, workspaceId, projectId, drawerItem.id);
    setComments(detail.comments);
  }

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
      setAssigneeSearchQuery("");
      setParticipantSearchQuery("");
      setParticipantStagingIds([]);
      setAssigneePanelOpen(false);
      setParticipantPanelOpen(false);
      setDeleteConfirmOpen(false);
      setDeleteError(null);
    }
  }, [open]);

  function closeDrawer() {
    if (editLoading || deleteLoading) return;
    onClose();
  }

  const canDeleteTask = variant === "edit" && !!drawerItem && !!token;

  async function onConfirmDeleteTask() {
    if (!token || !drawerItem) return;
    setDeleteError(null);
    setDeleteLoading(true);
    try {
      await apiFetch<void>(
        `/workspaces/${workspaceId}/projects/${projectId}/items/${drawerItem.id}`,
        { method: "DELETE", token },
      );
      const deletedId = drawerItem.id;
      setDeleteConfirmOpen(false);
      onTaskDeleted?.(deletedId);
      onClose();
    } catch (e: any) {
      setDeleteError(e?.message ?? "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  }

  function pickAssignee(userId: string) {
    setEditAssigneeUserId(userId);
    setAssigneeSearchQuery("");
    setAssigneePanelOpen(false);
  }

  function clearAssignee() {
    setEditAssigneeUserId("");
  }

  function toggleParticipantStaging(userId: string) {
    setParticipantStagingIds((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );
  }

  function confirmParticipantStaging() {
    if (participantStagingIds.length === 0) return;
    setEditParticipantUserIds((prev) => {
      const next = new Set(prev);
      for (const id of participantStagingIds) {
        if (id && id !== editAssigneeUserId) next.add(id);
      }
      return Array.from(next);
    });
    setParticipantStagingIds([]);
    setParticipantSearchQuery("");
    setParticipantPanelOpen(false);
  }

  function removeParticipant(userId: string) {
    setEditParticipantUserIds((prev) => prev.filter((x) => x !== userId));
    setParticipantStagingIds((prev) => prev.filter((x) => x !== userId));
  }

  function participantChipLabel(userId: string): string {
    return memberById.get(userId)?.display_name ?? drawerItem?.participants?.find((p) => p.id === userId)?.display_name ?? userId.slice(0, 8);
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
    if (!editAssigneeUserId.trim()) {
      setEditError("请选择负责人");
      return;
    }

    setEditError(null);
    setEditLoading(true);
    const peoplePayload = {
      assignee_user_id: editAssigneeUserId.trim(),
      participant_user_ids: editParticipantUserIds.filter((x) => x && x !== editAssigneeUserId.trim()),
      location: editLocation.trim() || null,
    };
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
              ...peoplePayload,
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
              version: drawerItem.version,
              ...peoplePayload,
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
      await refreshComments();
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

  async function deleteComment(commentId: string) {
    if (!token || !drawerItem) return;
    setCommentError(null);
    setCommentDeletingId(commentId);
    try {
      await apiFetch(`${itemCommentsPath(workspaceId, projectId, drawerItem.id)}/${commentId}`, {
        method: "DELETE",
        token,
      });
      if (replyToCommentId === commentId) setReplyToCommentId(null);
      await refreshComments();
    } catch (e: any) {
      setCommentError(e?.message ?? "删除评论失败");
    } finally {
      setCommentDeletingId(null);
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

  const headerSubtitle = useMemo(() => {
    const explicit = titleSubtitle?.trim();
    if (explicit) return explicit;
    if (contextWorkspaceName && contextProjectName) {
      return `${contextWorkspaceName} / ${contextProjectName}`;
    }
    return null;
  }, [titleSubtitle, contextWorkspaceName, contextProjectName]);

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
          {me?.id === c.author_user_id ? (
            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="text-neutral-muted shrink-0">状态</span>
              <select
                className="text-[12px] rounded-lg border border-border-subtle bg-surface-bright px-2 py-1 text-text-primary min-w-0 max-w-full disabled:opacity-50"
                value={c.completion_status === "done" ? "done" : "pending"}
                disabled={commentDeletingId === c.id}
                onChange={(e) =>
                  patchCommentCompletion(c.id, e.target.value === "done" ? "done" : "pending")
                }
                aria-label={depth === 0 ? "评论状态" : "回复状态"}
              >
                <option value="pending">未完成</option>
                <option value="done">已完成</option>
              </select>
              <button
                type="button"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={commentDeletingId === c.id}
                title={depth === 0 ? "删除评论" : "删除回复"}
                aria-label={depth === 0 ? "删除评论" : "删除回复"}
                onClick={() => void deleteComment(c.id)}
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          ) : null}
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

  const creatorLabel = variant === "edit" && drawerItem ? drawerItem.created_by?.display_name ?? "—" : "—";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={closeDrawer} />
      <aside className="absolute inset-y-0 right-0 w-[min(1120px,100vw)] bg-surface border-l border-border-subtle shadow-xl flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-border-subtle">
          <div className="min-w-0">
            <div className="font-subhead text-subhead text-text-primary truncate">{headerTitle}</div>
            <div className="mt-1 min-h-[1.25rem] truncate text-caption text-neutral-muted">
              {headerSubtitle ?? (membersLoading ? "加载中…" : "—")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-sm">
            {canDeleteTask ? (
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteConfirmOpen(true);
                }}
                disabled={editLoading || deleteLoading || itemLoading}
                title="删除任务"
                aria-label="删除任务"
              >
                <span className="material-symbols-outlined text-[18px] text-red-600">delete</span>
              </button>
            ) : null}
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border-subtle hover:bg-surface-container-lowest disabled:opacity-50"
              onClick={closeDrawer}
              disabled={editLoading || deleteLoading}
              title="关闭"
              aria-label="关闭"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
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

                <div className="rounded-xl border border-border-subtle bg-surface-container-lowest/40 p-4 space-y-4">
                  <div className="text-overline text-zinc-500 tracking-wide">人员与地点</div>
                  {membersLoading ? (
                    <p className="text-caption text-neutral-muted">加载成员列表…</p>
                  ) : null}
                  {membersError ? <p className="text-caption text-error">{membersError}</p> : null}

                  {variant === "edit" && drawerItem ? (
                    <div className="space-y-1">
                      <div className="text-caption font-medium text-on-surface-variant">创建人</div>
                      <div className="text-small text-text-primary">{creatorLabel}</div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-assignee-search`}>
                      负责人
                    </label>
                    {editAssigneeUserId ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-subtle bg-surface-bright py-1 pl-3 pr-1 text-small text-text-primary">
                          <span className="min-w-0 truncate">
                            {memberById.get(editAssigneeUserId)?.display_name ??
                              (drawerItem?.assignee?.id === editAssigneeUserId
                                ? drawerItem.assignee.display_name
                                : null) ??
                              (drawerItem?.created_by?.id === editAssigneeUserId
                                ? drawerItem.created_by.display_name
                                : null) ??
                              (me?.id === editAssigneeUserId ? me.display_name || me.email || "我" : null) ??
                              editAssigneeUserId.slice(0, 8)}
                          </span>
                          <button
                            type="button"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-muted hover:bg-surface-container-lowest hover:text-text-primary"
                            onClick={clearAssignee}
                            disabled={editLoading}
                            aria-label="移除负责人"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </span>
                      </div>
                    ) : null}
                    <div className="relative" ref={assigneePickerRef}>
                      <input
                        id={`${uid}-assignee-search`}
                        type="search"
                        autoComplete="off"
                        placeholder="搜索姓名或邮箱，从列表中选择负责人…"
                        className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                        value={assigneeSearchQuery}
                        onChange={(e) => {
                          setAssigneeSearchQuery(e.target.value);
                          setAssigneePanelOpen(true);
                        }}
                        onFocus={() => setAssigneePanelOpen(true)}
                        disabled={editLoading || memberOptions.length === 0}
                      />
                      {assigneePanelOpen && memberOptions.length > 0 ? (
                        <ul
                          role="listbox"
                          className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-border-subtle bg-surface py-1 shadow-lg"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          {filteredAssigneeCandidates.length === 0 ? (
                            <li className="px-3 py-2 text-caption text-neutral-muted">无匹配成员</li>
                          ) : (
                            filteredAssigneeCandidates.map((m) => (
                              <li key={m.user_id}>
                                <button
                                  type="button"
                                  role="option"
                                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-small text-text-primary hover:bg-surface-container-lowest"
                                  onClick={() => pickAssignee(m.user_id)}
                                >
                                  <span className="font-medium">{m.display_name}</span>
                                  {m.email ? (
                                    <span className="text-caption text-neutral-muted">{m.email}</span>
                                  ) : null}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      ) : null}
                    </div>
                    <p className="text-caption text-neutral-muted">
                      输入关键字实时筛选；点击一行设为负责人。新建时默认本人，可移除后重新选择。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-on-surface-variant">参与人</div>
                    {editParticipantUserIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {editParticipantUserIds.map((pid) => (
                          <span
                            key={pid}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-subtle bg-surface-bright py-1 pl-3 pr-1 text-small text-text-primary"
                          >
                            <span className="min-w-0 truncate">{participantChipLabel(pid)}</span>
                            <button
                              type="button"
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-muted hover:bg-surface-container-lowest hover:text-text-primary"
                              onClick={() => removeParticipant(pid)}
                              disabled={editLoading}
                              aria-label={`移除参与人 ${participantChipLabel(pid)}`}
                            >
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-caption text-neutral-muted">尚未添加参与人。</p>
                    )}
                    <div className="relative" ref={participantPickerRef}>
                      <input
                        id={`${uid}-participant-search`}
                        type="search"
                        autoComplete="off"
                        placeholder="搜索并多选参与人，点「确认添加」加入…"
                        className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                        value={participantSearchQuery}
                        onChange={(e) => {
                          setParticipantSearchQuery(e.target.value);
                          setParticipantPanelOpen(true);
                        }}
                        onFocus={() => setParticipantPanelOpen(true)}
                        disabled={editLoading || memberOptions.length === 0}
                      />
                      {participantPanelOpen && memberOptions.length > 0 ? (
                        <div
                          className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-lg"
                          onMouseDown={(e) => e.preventDefault()}
                        >
                          <ul role="listbox" className="max-h-44 overflow-auto py-1">
                            {filteredParticipantCandidates.length === 0 ? (
                              <li className="px-3 py-2 text-caption text-neutral-muted">
                                无匹配成员，或均已添加（不含负责人）。
                              </li>
                            ) : (
                              filteredParticipantCandidates.map((m) => {
                                const checked = participantStagingIds.includes(m.user_id);
                                return (
                                  <li key={m.user_id}>
                                    <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-small hover:bg-surface-container-lowest">
                                      <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-subtle text-primary focus:ring-primary/20"
                                        checked={checked}
                                        onChange={() => toggleParticipantStaging(m.user_id)}
                                        disabled={editLoading}
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className="font-medium text-text-primary">{m.display_name}</span>
                                        {m.email ? (
                                          <span className="mt-0.5 block text-caption text-neutral-muted">
                                            {m.email}
                                          </span>
                                        ) : null}
                                      </span>
                                    </label>
                                  </li>
                                );
                              })
                            )}
                          </ul>
                          <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface-container-lowest/50 px-2 py-2">
                            <button
                              type="button"
                              className="text-caption font-medium text-neutral-muted hover:text-text-primary"
                              onClick={() => {
                                setParticipantStagingIds([]);
                                setParticipantPanelOpen(false);
                              }}
                              disabled={editLoading}
                            >
                              取消选择
                            </button>
                            <button
                              type="button"
                              className="rounded-lg bg-primary px-3 py-1.5 text-caption font-semibold text-on-primary disabled:opacity-40"
                              onClick={confirmParticipantStaging}
                              disabled={editLoading || participantStagingIds.length === 0}
                            >
                              确认添加
                              {participantStagingIds.length > 0 ? `（${participantStagingIds.length}）` : ""}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-caption text-neutral-muted">
                      在下拉里勾选多人后点「确认添加」；已添加人员可点标签上的关闭移除。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-on-surface-variant" htmlFor={`${uid}-location`}>
                      地点
                    </label>
                    <input
                      id={`${uid}-location`}
                      type="text"
                      maxLength={500}
                      placeholder="例如：会议室 A、线上、客户现场…"
                      className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                      value={editLocation}
                      onChange={(e) => setEditLocation(e.target.value)}
                      disabled={editLoading}
                    />
                  </div>
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

      {deleteConfirmOpen && drawerItem ? (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!deleteLoading) setDeleteConfirmOpen(false);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="flex items-center justify-between">
                <div className="font-semibold font-subhead">删除任务</div>
                <button
                  className="text-sm underline disabled:opacity-50"
                  type="button"
                  disabled={deleteLoading}
                  onClick={() => {
                    if (!deleteLoading) setDeleteConfirmOpen(false);
                  }}
                >
                  关闭
                </button>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-error-container bg-error-container/10 p-4">
                  <div className="font-medium text-gray-900">确定要删除任务 “{drawerItem.title}” 吗？</div>
                  <div className="text-small text-text-secondary mt-2">此操作不可恢复，任务下的评论也会一并删除。</div>
                </div>

                {deleteError ? <div className="text-small text-error">{deleteError}</div> : null}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="text-sm rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-50"
                    onClick={() => setDeleteConfirmOpen(false)}
                    disabled={deleteLoading}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="text-sm rounded-xl bg-red-600 text-white px-4 py-2 hover:bg-red-700 disabled:opacity-50"
                    onClick={() => void onConfirmDeleteTask()}
                    disabled={deleteLoading}
                  >
                    {deleteLoading ? "删除中…" : "删除"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
