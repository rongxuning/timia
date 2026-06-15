"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useWorkspaceDiscussions } from "@/hooks/useWorkspaceDiscussions";
import type { DiscussionViewItem } from "@/types/api/views/workspace";

export type RecentDiscussionsProps = {
  token: string;
  workspaceId: string;
  onOpenTask: (row: DiscussionViewItem) => void;
};

export function RecentDiscussions({ token, workspaceId, onOpenTask }: RecentDiscussionsProps) {
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [showReplies, setShowReplies] = useState(true);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const { items, loading, error, hasMore, loadMore, refresh, setItems } = useWorkspaceDiscussions({
    token,
    workspaceId,
    incompleteOnly,
    includeComments: showComments,
    includeReplies: showReplies,
  });

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) void loadMore();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  async function patchCompletion(row: DiscussionViewItem, completion_status: "pending" | "done") {
    setPatchingId(row.id);
    try {
      const updated = await apiFetch<{ completion_status: string }>(
        `/workspaces/${workspaceId}/projects/${row.project_id}/items/${row.item_id}/comments/${row.id}`,
        { method: "PATCH", token, body: JSON.stringify({ completion_status }) },
      );
      const nextStatus = updated.completion_status === "done" ? "done" : "pending";
      setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, completion_status: nextStatus } : r)));
    } catch {
      /* silent */
    } finally {
      setPatchingId(null);
    }
  }

  async function deleteComment(row: DiscussionViewItem) {
    setDeletingId(row.id);
    try {
      await apiFetch(
        `/workspaces/${workspaceId}/projects/${row.project_id}/items/${row.item_id}/comments/${row.id}`,
        { method: "DELETE", token },
      );
      setItems((prev) => prev.filter((r) => r.id !== row.id));
      void refresh();
    } catch {
      /* silent */
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="grid min-w-0 grid-cols-1 gap-lg">
      <div className="flex min-w-0 flex-col gap-lg rounded-xl border border-border-subtle bg-white p-lg transition-all hover:shadow-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="font-subhead text-lg text-text-primary shrink-0">最近讨论</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-small text-text-secondary">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-bright px-2.5 py-1 hover:bg-surface-container-lowest">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-border-subtle text-primary focus:ring-primary/20"
                checked={incompleteOnly}
                onChange={(e) => setIncompleteOnly(e.target.checked)}
              />
              <span className="text-[12px] font-medium text-text-primary">未完成</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-bright px-2.5 py-1 hover:bg-surface-container-lowest">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-border-subtle text-primary focus:ring-primary/20"
                checked={showComments}
                onChange={(e) => setShowComments(e.target.checked)}
              />
              <span className="text-[12px] font-medium text-text-primary">评论</span>
            </label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-bright px-2.5 py-1 hover:bg-surface-container-lowest">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-border-subtle text-primary focus:ring-primary/20"
                checked={showReplies}
                onChange={(e) => setShowReplies(e.target.checked)}
              />
              <span className="text-[12px] font-medium text-text-primary">回复</span>
            </label>
          </div>
        </div>

        {items.length === 0 && !loading && !error ? (
          <div className="text-small text-text-secondary">暂无任务评论。</div>
        ) : (
          <div className="max-h-[640px] min-w-0 space-y-lg overflow-x-hidden overflow-y-auto pr-1">
            {items.map((row) => {
              const done = (row.completion_status ?? "pending") === "done";
              return (
                <div
                  key={row.id}
                  className="flex min-w-0 gap-md items-start rounded-xl p-2 -m-2 transition-colors hover:bg-surface-container-lowest/80"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 gap-lg items-start text-left"
                    onClick={() => onOpenTask(row)}
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
                        <span className="text-small font-bold text-text-primary">{row.author_display_name || "用户"}</span>
                      </div>
                      <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
                        {row.body}
                      </p>
                      <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          {row.is_reply ? "回复" : "评论"}时间：{row.created_at_exact_label}
                        </span>
                        <span>距今：{row.created_ago_label}</span>
                      </div>
                      <div className="text-caption text-neutral-muted truncate">
                        {row.project_name} · {row.item_title}
                      </div>
                    </div>
                  </button>
                  {row.is_author ? (
                    <div className="shrink-0 flex items-center gap-2 pt-1">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-neutral-muted">状态</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={done}
                          disabled={patchingId === row.id || deletingId === row.id}
                          className={[
                            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border-subtle transition-colors disabled:opacity-50",
                            done ? "bg-emerald-500" : "bg-zinc-300",
                          ].join(" ")}
                          onClick={(e) => {
                            e.stopPropagation();
                            void patchCompletion(row, done ? "pending" : "done");
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
                      <button
                        type="button"
                        className="mt-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
                        disabled={patchingId === row.id || deletingId === row.id}
                        title={row.is_reply ? "删除回复" : "删除评论"}
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteComment(row);
                        }}
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div ref={sentinelRef} className="h-px" aria-hidden />
            {loading && <div className="text-center text-caption text-neutral-muted py-2">加载中…</div>}
            {error && (
              <div className="flex items-center justify-center gap-2 text-caption text-error py-2">
                <span>{error}</span>
                <button type="button" className="text-primary hover:underline" onClick={() => void loadMore()}>
                  重试
                </button>
              </div>
            )}
            {!hasMore && !loading && items.length > 0 && (
              <div className="text-center text-caption text-neutral-muted py-2">已加载全部讨论</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
