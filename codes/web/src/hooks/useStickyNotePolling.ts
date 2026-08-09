"use client";

import { useEffect, useRef, useState } from "react";
import {
  getLatestStickyNoteParse,
  isStickyNoteParseTerminal,
  type StickyNoteAIParseOut,
} from "@/lib/api/sticky-notes";

/**
 * Polls the latest AI parse for a sticky note until it reaches a terminal
 * status (success / failed / skipped) or times out.
 */
export function useStickyNotePolling(
  token: string | null,
  noteId: string | null,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
) {
  const { intervalMs = 2000, timeoutMs = 30000 } = opts;
  const [parse, setParse] = useState<StickyNoteAIParseOut | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!token || !noteId) return;
    cancelledRef.current = false;
    setIsPolling(true);

    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const next = await getLatestStickyNoteParse(token, noteId);
        if (cancelledRef.current) return;
        if (next) setParse(next);
        if (next && isStickyNoteParseTerminal(next)) {
          setIsPolling(false);
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          setIsPolling(false);
          return;
        }
        timer = setTimeout(tick, intervalMs);
      } catch {
        setIsPolling(false);
      }
    };
    void tick();

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [token, noteId, intervalMs, timeoutMs]);

  return { parse, isPolling };
}
