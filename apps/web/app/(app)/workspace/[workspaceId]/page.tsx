"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { primeProjectNameForBreadcrumb, primeWorkspaceNameForBreadcrumb } from "@/components/Breadcrumbs";
import { TaskDrawerWithComments } from "@/components/TaskDrawerWithComments";
import { ProjectModal } from "@/components/ProjectModal";

const RECENT_DISCUSSIONS_PAGE_SIZE = 20;

type Workspace = {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
  created_by_display_name?: string | null;
};
type Me = { id: string };
type Member = { id: string; user_id: string; email: string; display_name: string; role: string; status: string };
type Project = {
  id: string;
  name: string;
  description?: string | null;
  archived: boolean;
  todo_doing?: number;
  done_archived?: number;
  /** 当前用户是否可管理该项目（空间 owner 或项目 owner） */
  can_manage?: boolean;
};
type WorkspaceStats = {
  project_count: number;
  total_task_count: number;
  todo_count: number;
  doing_count: number;
  done_count: number;
  archived_count: number;
  high_priority_count: number;
};

type RecentDiscussion = {
  id: string;
  body: string;
  created_at: string;
  author_user_id: string;
  author_display_name: string;
  is_reply: boolean;
  completion_status?: string;
  project_id: string;
  project_name: string;
  item_id: string;
  item_title: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatYmdHm(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 评论/回复列表：精确时间 */
function formatDiscussionExact(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 距今描述：7 天及以上固定为「一周前」 */
function formatDiscussionAgo(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const ms = Date.now() - d.getTime();
  if (ms < 0) return "刚刚";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return "一周前";
}

export default function WorkspaceHome() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<WorkspaceStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const token = useMemo(() => getToken(), []);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<Project | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleteProjectError, setDeleteProjectError] = useState<string | null>(null);
  const [recentDiscussions, setRecentDiscussions] = useState<RecentDiscussion[]>([]);
  const [discussionsLoading, setDiscussionsLoading] = useState(false);
  const [discussionsError, setDiscussionsError] = useState<string | null>(null);
  const [discussionsHasMore, setDiscussionsHasMore] = useState(true);
  const discussionsSentinelRef = useRef<HTMLDivElement | null>(null);
  const discussionsRequestSeqRef = useRef(0);
  const discussionsLoadingRef = useRef(false);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [taskDrawerProjectId, setTaskDrawerProjectId] = useState<string | null>(null);
  const [taskDrawerItemId, setTaskDrawerItemId] = useState<string | null>(null);
  const [taskDrawerHighlightId, setTaskDrawerHighlightId] = useState<string | null>(null);
  /** 勾选后仅展示未完成（pending）的评论与回复 */
  const [discussionsFilterIncompleteOnly, setDiscussionsFilterIncompleteOnly] = useState(false);
  /** 勾选表示展示该类型；默认均展示 */
  const [discussionsShowComments, setDiscussionsShowComments] = useState(true);
  const [discussionsShowReplies, setDiscussionsShowReplies] = useState(true);
  const [discussionsPatchingId, setDiscussionsPatchingId] = useState<string | null>(null);
  const [editWorkspaceOpen, setEditWorkspaceOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const canEditWorkspace = useMemo(() => {
    if (!me?.id) return false;
    const row = members.find((m) => m.user_id === me.id && m.status === "active");
    return row?.role === "owner";
  }, [me, members]);

  const workspaceHealthPercent = useMemo(() => {
    const total = stats?.total_task_count ?? 0;
    if (total === 0) return null;
    const doneArchived =
      stats?.done_count != null && stats?.archived_count != null
        ? stats.done_count + stats.archived_count
        : total - (stats?.todo_count ?? 0) - (stats?.doing_count ?? 0);
    return Math.round((doneArchived / total) * 100);
  }, [stats]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setError(null);
    Promise.all([
      apiFetch<Workspace>(`/workspaces/${workspaceId}`, { token }),
      apiFetch<Member[]>(`/workspaces/${workspaceId}/members`, { token }).catch(() => [] as Member[]),
      apiFetch<Project[]>(`/workspaces/${workspaceId}/projects`, { token }).catch(() => [] as Project[]),
      apiFetch<WorkspaceStats>(`/workspaces/${workspaceId}/stats`, { token }).catch(() => null as any),
      apiFetch<Record<string, { todo_doing: number; done_archived: number }>>(
        `/workspaces/${workspaceId}/projects/progress`,
        { token },
      ).catch(() => ({})),
      apiFetch<Me>("/auth/me", { token }).catch(() => null as any),
    ])
      .then(([w, m, p, s, progress, meRes]) => {
        setWorkspace(w);
        setMembers(m);
        setMe(meRes);
        primeWorkspaceNameForBreadcrumb(w.id, w.name);
        const prog = progress as Record<string, { todo_doing: number; done_archived: number }>;
        const visible = p.filter((x) => !x.archived).map((proj) => ({
          ...proj,
          can_manage: (proj as { can_manage?: boolean }).can_manage ?? false,
          todo_doing: prog[proj.id]?.todo_doing ?? 0,
          done_archived: prog[proj.id]?.done_archived ?? 0,
        }));
        setProjects(visible);
        for (const proj of visible) {
          primeProjectNameForBreadcrumb(w.id, proj.id, proj.name);
        }
        setStats(s);
      })
      .catch((e: any) => setError(e?.message ?? "加载失败"));
  }, [router, token, workspaceId]);

  const loadMoreDiscussions = useCallback(
    async (reset = false) => {
      if (!token) return;
      if (discussionsLoadingRef.current) return;
      if (!reset && !discussionsHasMore) return;

      const seq = ++discussionsRequestSeqRef.current;
      discussionsLoadingRef.current = true;
      setDiscussionsLoading(true);
      setDiscussionsError(null);
      try {
        const offset = reset ? 0 : recentDiscussions.length;
        const list = await apiFetch<RecentDiscussion[]>(
          `/workspaces/${workspaceId}/recent-discussions?limit=${RECENT_DISCUSSIONS_PAGE_SIZE}&offset=${offset}`,
          { token },
        );
        if (seq !== discussionsRequestSeqRef.current) return;
        setRecentDiscussions((prev) => {
          if (reset) return list;
          const seen = new Set(prev.map((x) => x.id));
          const fresh = list.filter((x) => !seen.has(x.id));
          return [...prev, ...fresh];
        });
        setDiscussionsHasMore(list.length === RECENT_DISCUSSIONS_PAGE_SIZE);
      } catch (e: any) {
        if (seq !== discussionsRequestSeqRef.current) return;
        setDiscussionsError(e?.message ?? "加载失败");
      } finally {
        if (seq === discussionsRequestSeqRef.current) {
          discussionsLoadingRef.current = false;
          setDiscussionsLoading(false);
        }
      }
    },
    [token, workspaceId, recentDiscussions.length, discussionsHasMore],
  );

  useEffect(() => {
    if (!token) return;
    setRecentDiscussions([]);
    setDiscussionsHasMore(true);
    setDiscussionsError(null);
    discussionsRequestSeqRef.current++;
    discussionsLoadingRef.current = false;
    void loadMoreDiscussions(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspaceId]);

  useEffect(() => {
    if (!discussionsHasMore) return;
    const node = discussionsSentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMoreDiscussions(false);
            break;
          }
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [discussionsHasMore, loadMoreDiscussions]);

  const visibleDiscussions = useMemo(() => {
    return recentDiscussions.filter((row) => {
      const status = row.completion_status ?? "pending";
      if (discussionsFilterIncompleteOnly && status === "done") return false;
      if (row.is_reply) {
        if (!discussionsShowReplies) return false;
        return true;
      }
      if (!discussionsShowComments) return false;
      return true;
    });
  }, [
    recentDiscussions,
    discussionsFilterIncompleteOnly,
    discussionsShowComments,
    discussionsShowReplies,
  ]);

  async function patchDiscussionCommentCompletion(row: RecentDiscussion, completion_status: "pending" | "done") {
    if (!token) return;
    setDiscussionsPatchingId(row.id);
    try {
      const updated = await apiFetch<{ completion_status: string }>(
        `/workspaces/${workspaceId}/projects/${row.project_id}/items/${row.item_id}/comments/${row.id}`,
        { method: "PATCH", token, body: JSON.stringify({ completion_status }) },
      );
      const nextStatus = updated.completion_status === "done" ? "done" : "pending";
      setRecentDiscussions((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, completion_status: nextStatus } : r)),
      );
    } catch {
      /* 静默失败，抽屉内可再次操作 */
    } finally {
      setDiscussionsPatchingId(null);
    }
  }

  function openEditWorkspaceModal() {
    if (!workspace || !canEditWorkspace) return;
    setEditName(workspace.name);
    setEditDescription(workspace.description ?? "");
    setEditError(null);
    setEditWorkspaceOpen(true);
  }

  async function onSaveWorkspaceDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !workspace) {
      router.push("/login");
      return;
    }
    const name = editName.trim();
    const description = editDescription.trim();
    if (!name) {
      setEditError("请输入工作空间名称");
      return;
    }
    setEditError(null);
    setEditLoading(true);
    try {
      const updated = await apiFetch<Workspace>(`/workspaces/${workspaceId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ name, description: description || null }),
      });
      setWorkspace(updated);
      primeWorkspaceNameForBreadcrumb(updated.id, updated.name);
      setEditWorkspaceOpen(false);
    } catch (err: any) {
      setEditError(err?.message ?? "保存失败");
    } finally {
      setEditLoading(false);
    }
  }

  async function onDeleteProject(project: Project) {
    if (!token) {
      router.push("/login");
      return;
    }
    setDeleteProjectError(null);
    setDeletingProjectId(project.id);
    try {
      await apiFetch<void>(`/workspaces/${workspaceId}/projects/${project.id}`, { method: "DELETE", token });
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
      setDeleteProjectOpen(false);
      setDeleteProjectTarget(null);
    } catch (e: any) {
      setDeleteProjectError(e?.message ?? "删除失败");
    } finally {
      setDeletingProjectId(null);
    }
  }

  const activeMembers = members.filter((m) => m.status === "active");
  const ownerMembers = activeMembers.filter((m) => m.role === "owner");
  const participantMembers = activeMembers.filter((m) => m.role === "member");
  const memberPreview = activeMembers.slice(0, 3);
  const remainingMemberCount = Math.max(0, activeMembers.length - memberPreview.length);

  return (
    <main className="min-w-0 px-lg py-lg">
      <div className="mx-auto min-w-0 max-w-container-max space-y-2xl">
        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[2fr_2.5fr_1.5fr_2fr_2fr] items-stretch gap-lg">
          <div
            className={
              canEditWorkspace
                ? "flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                : "flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg"
            }
            role={canEditWorkspace ? "button" : undefined}
            tabIndex={canEditWorkspace ? 0 : undefined}
            aria-label={canEditWorkspace ? "编辑工作空间名称与描述" : undefined}
            onClick={canEditWorkspace ? openEditWorkspaceModal : undefined}
            onKeyDown={
              canEditWorkspace
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEditWorkspaceModal();
                    }
                  }
                : undefined
            }
          >
            <span className="text-sm font-semibold text-primary">工作空间</span>
            <div className="space-y-1">
              <div className="font-subhead text-lg text-text-primary truncate">{workspace?.name ?? "—"}</div>
              <div className="text-small text-text-secondary truncate">{workspace?.description || "暂无描述。"}</div>
              <div className="text-caption text-neutral-muted">
                创建于 {workspace?.created_at ? formatYmdHm(workspace.created_at) : "—"}
              </div>
              <div className="text-caption text-neutral-muted">
                创建者 {workspace?.created_by_display_name ?? "—"}
              </div>
              {canEditWorkspace && (
                <div className="text-caption text-primary pt-1">点击编辑名称与描述</div>
              )}
            </div>
          </div>

          <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <span className="text-sm font-semibold text-primary">成员</span>
            <div className="space-y-2 mt-1.5">
              {/* Row 1: Total */}
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-section-heading">{activeMembers.length}</span>
                <span className="text-text-secondary text-caption">总计</span>
              </div>

              {/* Row 2: Workspace owners */}
              <div className="flex items-center justify-between gap-3">
                <div className="text-caption text-neutral-muted">负责人（owner）{ownerMembers.length}</div>
                <div className="flex -space-x-2">
                  {ownerMembers.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                      title={m.display_name || m.email}
                    >
                      {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                    </div>
                  ))}
                  {ownerMembers.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{ownerMembers.length - 3}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Workspace members */}
              <div className="flex items-center justify-between gap-3">
                <div className="text-caption text-neutral-muted">成员 {participantMembers.length}</div>
                <div className="flex -space-x-2">
                  {participantMembers.slice(0, 3).map((m) => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full border-2 border-white bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant"
                      title={m.display_name || m.email}
                    >
                      {(m.display_name?.trim().slice(0, 1) || m.email.trim().slice(0, 1)).toUpperCase()}
                    </div>
                  ))}
                  {participantMembers.length > 3 && (
                    <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      +{participantMembers.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <span className="text-sm font-semibold text-primary">项目数量</span>
            <div className="flex items-baseline gap-2">
              <span className="font-headline text-section-heading">{stats?.project_count ?? projects.length}</span>
              <span className="text-text-secondary text-caption">个项目</span>
            </div>
          </div>

          <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <span className="text-sm font-semibold text-primary">项目健康度</span>
            <div className="space-y-3 mt-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-headline text-section-heading">
                  {workspaceHealthPercent == null ? "—" : `${workspaceHealthPercent}%`}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-caption text-neutral-muted">待办</div>
                <div className="font-bold text-lg text-text-primary">{stats?.todo_count ?? 0}</div>
              </div>
              <div className="space-y-1">
                <div className="text-caption text-neutral-muted">进行中</div>
                <div className="font-bold text-lg text-text-primary">{stats?.doing_count ?? 0}</div>
              </div>
              <div className="space-y-1">
                <div className="text-caption text-neutral-muted">高优先级</div>
                <div className="font-bold text-lg text-text-primary">{stats?.high_priority_count ?? 0}</div>
              </div>
              </div>
            </div>
          </div>

          <div className="flex min-h-44 flex-col justify-between rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-lg">
            <span className="text-sm font-semibold text-primary">工作空间设置</span>
            <div className="grid grid-cols-1 gap-sm">
              <Link
                className="w-full px-lg py-sm rounded-xl border border-zinc-200 text-sm font-medium text-text-primary hover:bg-zinc-50 transition-all flex items-center justify-center gap-2"
                href={`/workspace/${workspaceId}/members`}
              >
                <span className="material-symbols-outlined text-lg">
                  {canEditWorkspace ? "person_add" : "group"}
                </span>
                {canEditWorkspace ? "成员管理" : "查看成员"}
              </Link>
              {canEditWorkspace ? (
                <button
                  type="button"
                  className="w-full px-lg py-sm rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-hover shadow-indigo-100 shadow-lg hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                  onClick={() => setCreateProjectOpen(true)}
                >
                  <span className="material-symbols-outlined text-lg">add</span>
                  新建项目
                </button>
              ) : (
                <p className="text-caption text-neutral-muted px-1 py-2 text-center">
                  仅空间负责人可新建项目；你可访问被加入的项目与任务。
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-lg">
          <h2 className="font-subhead text-subhead text-text-primary">进行中的项目</h2>

          {projects.length === 0 ? (
            <div className="bg-white rounded-xl border border-border-subtle p-lg text-small text-text-secondary">
              {canEditWorkspace
                ? "暂无项目。创建第一个项目即可开始。"
                : "暂无你可访问的项目。请联系空间负责人将你加入项目。"}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
              {projects.slice(0, 4).map((p) => {
                const doneArchived = p.done_archived ?? 0;
                const todoDoing = p.todo_doing ?? 0;
                const total = todoDoing + doneArchived;
                const progressPct = total === 0 ? 0 : Math.round((doneArchived / total) * 100);
                return (
                <Link
                  key={p.id}
                  href={`/workspace/${workspaceId}/projects/${p.id}`}
                  className="bg-white rounded-xl border border-border-subtle overflow-hidden hover:shadow-xl transition-all group relative"
                >
                  <div className="p-lg space-y-lg">
                    <div className="flex justify-between items-start gap-md">
                      <div className="min-w-0 flex-1 space-y-xs">
                        <div className="flex w-max max-w-full min-w-0 flex-nowrap items-center gap-sm">
                          <h3 className="font-subhead text-xl text-text-primary group-hover:text-primary transition-colors min-w-0 truncate">
                            {p.name}
                          </h3>
                          <span className="shrink-0 whitespace-nowrap bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-overline">
                            进行中
                          </span>
                        </div>
                        <p className="text-body text-text-secondary text-sm">
                          {p.description || "暂无描述。"}
                        </p>
                      </div>
                      {p.can_manage ? (
                      <button
                        type="button"
                        className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 group/delete disabled:cursor-not-allowed disabled:opacity-50"
                        title="删除项目"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteProjectError(null);
                          setDeleteProjectTarget(p);
                          setDeleteProjectOpen(true);
                        }}
                        disabled={deletingProjectId === p.id}
                      >
                        <span className="material-symbols-outlined text-[18px] text-red-600 group-hover/delete:text-red-700">
                          delete
                        </span>
                      </button>
                      ) : null}
                    </div>

                    <div className="space-y-sm">
                      <div className="flex justify-between text-caption">
                        <span className="text-zinc-500">项目进度</span>
                        <span className="font-bold text-primary">
                          {doneArchived}/{total}（{progressPct}%）
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid min-w-0 grid-cols-1 gap-lg">
          <div className="flex min-w-0 flex-col gap-lg rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-md">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <h3 className="font-subhead text-lg text-text-primary shrink-0">最近讨论</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-text-secondary">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-bright px-2.5 py-1 hover:bg-surface-container-lowest">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border-subtle text-primary focus:ring-primary/20"
                    checked={discussionsFilterIncompleteOnly}
                    onChange={(e) => setDiscussionsFilterIncompleteOnly(e.target.checked)}
                  />
                  <span className="text-[12px] font-medium text-text-primary" title="仅展示未完成的评论与回复">
                    未完成
                  </span>
                </label>
                <span className="hidden sm:inline text-neutral-muted" aria-hidden>
                  |
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-bright px-2.5 py-1 hover:bg-surface-container-lowest">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border-subtle text-primary focus:ring-primary/20"
                    checked={discussionsShowComments}
                    onChange={(e) => setDiscussionsShowComments(e.target.checked)}
                  />
                  <span className="text-[12px] font-medium text-text-primary">评论</span>
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-bright px-2.5 py-1 hover:bg-surface-container-lowest">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-border-subtle text-primary focus:ring-primary/20"
                    checked={discussionsShowReplies}
                    onChange={(e) => setDiscussionsShowReplies(e.target.checked)}
                  />
                  <span className="text-[12px] font-medium text-text-primary">回复</span>
                </label>
              </div>
            </div>

            {recentDiscussions.length === 0 && !discussionsLoading && !discussionsError ? (
              <div className="text-small text-text-secondary">暂无任务评论。</div>
            ) : (
              <div className="max-h-[640px] min-w-0 space-y-lg overflow-x-hidden overflow-y-auto pr-1">
                {visibleDiscussions.length === 0 && !discussionsLoading && !discussionsError ? (
                  <div className="text-small text-text-secondary">没有符合筛选条件的讨论。</div>
                ) : null}
                {visibleDiscussions.map((row) => {
                  const done = (row.completion_status ?? "pending") === "done";
                  const isAuthor = !!me?.id && row.author_user_id === me.id;
                  return (
                    <div
                      key={row.id}
                      className="flex min-w-0 gap-md items-start rounded-xl p-2 -m-2 transition-colors hover:bg-surface-container-lowest/80"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 gap-lg items-start text-left"
                        onClick={() => {
                          setTaskDrawerProjectId(row.project_id);
                          setTaskDrawerItemId(row.item_id);
                          setTaskDrawerHighlightId(row.id);
                          setTaskDrawerOpen(true);
                        }}
                      >
                        <div className="h-10 w-10 rounded-full bg-surface-container shrink-0 flex items-center justify-center">
                          <span className="material-symbols-outlined text-indigo-400 text-xl">
                            {row.is_reply ? "reply" : "chat_bubble"}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                row.is_reply ? "bg-zinc-100 text-zinc-600" : "bg-indigo-50 text-indigo-700"
                              }`}
                            >
                              {row.is_reply ? "回复" : "评论"}
                            </span>
                            <span className="text-small font-bold text-text-primary">
                              {row.author_display_name || "用户"}
                            </span>
                          </div>
                          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                            {row.body}
                          </p>
                          <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>
                              {row.is_reply ? "回复" : "评论"}时间：{formatDiscussionExact(row.created_at)}
                            </span>
                            <span>距今：{formatDiscussionAgo(row.created_at)}</span>
                          </div>
                          <div className="text-caption text-neutral-muted truncate">
                            {row.project_name} · {row.item_title}
                          </div>
                        </div>
                      </button>
                      {isAuthor ? (
                        <div className="shrink-0 flex flex-col items-end gap-1 pt-1">
                          <span className="text-[10px] text-neutral-muted">状态</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={done}
                            aria-label={
                              row.is_reply
                                ? done
                                  ? "回复标记为未完成"
                                  : "回复标记为已完成"
                                : done
                                  ? "评论标记为未完成"
                                  : "评论标记为已完成"
                            }
                            disabled={discussionsPatchingId === row.id}
                            className={[
                              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border-subtle transition-colors disabled:opacity-50",
                              done ? "bg-emerald-500" : "bg-zinc-300",
                            ].join(" ")}
                            onClick={(e) => {
                              e.stopPropagation();
                              void patchDiscussionCommentCompletion(row, done ? "pending" : "done");
                            }}
                          >
                            <span
                              className={[
                                "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-transform",
                                done ? "translate-x-5" : "translate-x-1",
                              ].join(" ")}
                            />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                <div ref={discussionsSentinelRef} className="h-px" aria-hidden />

                {discussionsLoading && (
                  <div className="text-center text-caption text-neutral-muted py-2">加载中…</div>
                )}
                {discussionsError && (
                  <div className="flex items-center justify-center gap-2 text-caption text-error py-2">
                    <span>{discussionsError}</span>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => void loadMoreDiscussions(false)}
                    >
                      重试
                    </button>
                  </div>
                )}
                {!discussionsHasMore && !discussionsLoading && recentDiscussions.length > 0 && (
                  <div className="text-center text-caption text-neutral-muted py-2">已加载全部讨论</div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <ProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        workspaceId={workspaceId}
        token={token}
        mode="create"
        onSuccess={(created) => {
          const row: Project = {
            id: created.id,
            name: created.name,
            description: created.description ?? null,
            archived: created.archived ?? false,
            todo_doing: 0,
            done_archived: 0,
            can_manage: true,
          };
          setProjects((prev) => [row, ...prev]);
          primeProjectNameForBreadcrumb(workspaceId, row.id, row.name);
          setStats((s) => (s ? { ...s, project_count: (s.project_count ?? 0) + 1 } : s));
        }}
      />

      {editWorkspaceOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!editLoading) setEditWorkspaceOpen(false);
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="flex items-center justify-between">
                <div className="font-semibold font-subhead">编辑工作空间</div>
                <button
                  className="text-sm underline disabled:opacity-50"
                  type="button"
                  disabled={editLoading}
                  onClick={() => {
                    if (!editLoading) setEditWorkspaceOpen(false);
                  }}
                >
                  关闭
                </button>
              </div>
              <form onSubmit={onSaveWorkspaceDetails} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="editWorkspaceName">
                    名称
                  </label>
                  <input
                    id="editWorkspaceName"
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="例如：产品团队"
                    autoFocus
                    disabled={editLoading}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-on-surface-variant" htmlFor="editWorkspaceDescription">
                    描述
                  </label>
                  <textarea
                    id="editWorkspaceDescription"
                    className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none min-h-[96px] resize-none"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="这个工作空间主要做什么？"
                    disabled={editLoading}
                  />
                </div>
                {editError && <div className="text-small text-error">{editError}</div>}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="text-sm rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-50"
                    onClick={() => setEditWorkspaceOpen(false)}
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
          </div>
        </div>
      )}

      <TaskDrawerWithComments
        open={taskDrawerOpen}
        onClose={() => {
          setTaskDrawerOpen(false);
          setTaskDrawerProjectId(null);
          setTaskDrawerItemId(null);
          setTaskDrawerHighlightId(null);
        }}
        workspaceId={workspaceId}
        projectId={taskDrawerProjectId ?? ""}
        itemId={taskDrawerItemId}
        highlightCommentId={taskDrawerHighlightId}
        token={token}
      />

      {deleteProjectOpen && deleteProjectTarget && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!deletingProjectId) {
                setDeleteProjectOpen(false);
                setDeleteProjectTarget(null);
              }
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
            <div className="w-[min(720px,calc(100vw-2rem))] rounded-xl bg-surface border border-border-subtle p-6 space-y-5 shadow-sm max-h-[calc(100vh-6rem)] overflow-auto">
              <div className="flex items-center justify-between">
                <div className="font-semibold font-subhead">删除项目</div>
                <button
                  className="text-sm underline disabled:opacity-50"
                  type="button"
                  disabled={!!deletingProjectId}
                  onClick={() => {
                    if (!deletingProjectId) {
                      setDeleteProjectOpen(false);
                      setDeleteProjectTarget(null);
                    }
                  }}
                >
                  关闭
                </button>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-error-container bg-error-container/10 p-4">
                  <div className="font-medium text-gray-900">确定要删除项目 “{deleteProjectTarget.name}” 吗？</div>
                  <div className="text-small text-text-secondary mt-2">此操作不可恢复，项目下的任务也会一并删除。</div>
                </div>

                {deleteProjectError && <div className="text-small text-error">{deleteProjectError}</div>}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="text-sm rounded-xl border border-border-subtle px-4 py-2 disabled:opacity-50"
                    onClick={() => {
                      setDeleteProjectOpen(false);
                      setDeleteProjectTarget(null);
                    }}
                    disabled={!!deletingProjectId}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="text-sm rounded-xl bg-red-600 text-white px-4 py-2 hover:bg-red-700 disabled:opacity-50"
                    onClick={() => onDeleteProject(deleteProjectTarget)}
                    disabled={deletingProjectId === deleteProjectTarget.id}
                  >
                    {deletingProjectId === deleteProjectTarget.id ? "删除中…" : "删除"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

