"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addPlanComment, listPlanComments, type PlanCommentOut } from "@/lib/api/plans";
import { getToken } from "@/lib/auth";
import { planApiMessage } from "./planLabels";

const FIELD_CLASS =
  "w-full rounded-xl border border-border-subtle bg-surface-bright px-3 py-2 text-small text-text-primary outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10";

function formatCommentTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("zh-CN");
}

export function PlanComments({ templateId }: { templateId: string }) {
  const [comments, setComments] = useState<PlanCommentOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<PlanCommentOut | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listPlanComments(token, templateId)
      .then((rows) => {
        if (!cancelled) setComments(rows);
      })
      .catch((err: { message?: string }) => {
        if (!cancelled) setError(planApiMessage(err?.message ?? "加载评论失败"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  const roots = useMemo(
    () =>
      comments
        .filter((comment) => !comment.parent_comment_id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [comments],
  );

  const repliesByParent = useMemo(() => {
    const map = new Map<string, PlanCommentOut[]>();
    for (const comment of comments) {
      if (!comment.parent_comment_id) continue;
      const list = map.get(comment.parent_comment_id) ?? [];
      list.push(comment);
      map.set(comment.parent_comment_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return map;
  }, [comments]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const token = getToken();
    const text = body.trim();
    if (!token || !text) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await addPlanComment(token, templateId, {
        body: text,
        parent_comment_id: replyTo?.id ?? null,
      });
      setComments((current) => [...current, created]);
      setBody("");
      setReplyTo(null);
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "发送失败";
      setError(planApiMessage(message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-small font-medium text-text-primary">讨论</h2>
      {loading ? (
        <p className="text-small text-text-secondary">加载中…</p>
      ) : roots.length === 0 ? (
        <p className="text-small text-text-secondary">还没有讨论</p>
      ) : (
        <ul className="space-y-2">
          {roots.map((comment) => {
            const replies = repliesByParent.get(comment.id) ?? [];
            return (
              <li key={comment.id}>
                <div className="rounded-xl border border-border-subtle bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-small font-medium text-text-primary">
                      {comment.author_display_name}
                    </span>
                    <span className="text-caption text-neutral-muted">
                      {formatCommentTime(comment.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-small text-text-primary">{comment.body}</p>
                  <button
                    type="button"
                    className="mt-2 text-caption text-indigo-700 hover:underline"
                    onClick={() => setReplyTo(comment)}
                  >
                    回复
                  </button>
                </div>
                {replies.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {replies.map((reply) => (
                      <li key={reply.id} className="ml-6">
                        <div className="rounded-xl border border-border-subtle bg-white p-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-small font-medium text-text-primary">
                              {reply.author_display_name}
                            </span>
                            <span className="text-caption text-neutral-muted">
                              {formatCommentTime(reply.created_at)}
                            </span>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-small text-text-primary">{reply.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <form className="space-y-2" onSubmit={handleSubmit}>
        {replyTo ? (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-caption text-indigo-700">
            <span className="truncate">正在回复：{replyTo.author_display_name}</span>
            <button type="button" className="shrink-0 hover:underline" onClick={() => setReplyTo(null)}>
              取消回复
            </button>
          </div>
        ) : null}
        <textarea
          className={`${FIELD_CLASS} min-h-[72px]`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={replyTo ? "写下回复" : "写下评论"}
          disabled={submitting}
        />
        {error ? <p className="text-caption text-error">{error}</p> : null}
        <button
          type="submit"
          className="rounded-xl bg-primary px-4 py-2 text-small text-on-primary disabled:opacity-50"
          disabled={submitting || !body.trim()}
        >
          {submitting ? "发送中…" : "发送"}
        </button>
      </form>
    </section>
  );
}
