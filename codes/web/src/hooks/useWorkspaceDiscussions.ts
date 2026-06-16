"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWorkspaceDiscussions } from "@/lib/api/workspace-views";
import type { DiscussionViewItem } from "@/types/api/views/workspace";

const PAGE_SIZE = 20;

export type UseWorkspaceDiscussionsOptions = {
  token: string | null;
  workspaceId: string;
  incompleteOnly: boolean;
  includeComments: boolean;
  includeReplies: boolean;
};

export function useWorkspaceDiscussions({
  token,
  workspaceId,
  incompleteOnly,
  includeComments,
  includeReplies,
}: UseWorkspaceDiscussionsOptions) {
  const [items, setItems] = useState<DiscussionViewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);
  const seqRef = useRef(0);

  const filterKey = `${incompleteOnly}:${includeComments}:${includeReplies}`;

  const load = useCallback(
    async (reset: boolean) => {
      if (!token) return;
      if (loadingRef.current) return;
      if (!reset && !hasMore) return;

      const seq = ++seqRef.current;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const offset = reset ? 0 : items.length;
        const res = await fetchWorkspaceDiscussions(token, workspaceId, {
          limit: PAGE_SIZE,
          offset,
          incompleteOnly,
          includeComments,
          includeReplies,
        });
        if (seq !== seqRef.current) return;
        setItems((prev) => {
          if (reset) return res.items;
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...res.items.filter((x) => !seen.has(x.id))];
        });
        setHasMore(res.has_more);
      } catch (e: unknown) {
        if (seq !== seqRef.current) return;
        const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : "加载失败";
        setError(msg);
      } finally {
        if (seq === seqRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [token, workspaceId, items.length, hasMore, incompleteOnly, includeComments, includeReplies],
  );

  useEffect(() => {
    if (!token) return;
    setItems([]);
    setHasMore(true);
    seqRef.current++;
    loadingRef.current = false;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workspaceId, filterKey]);

  const refresh = useCallback(() => load(true), [load]);

  return { items, loading, error, hasMore, loadMore: () => load(false), refresh, setItems };
}
