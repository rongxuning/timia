"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHealthWorkouts } from "@/lib/api/health-views";
import type { HealthWorkout } from "@/types/api/views/health";

export const HEALTH_WORKOUT_PAGE_DAYS = 7;
const EMPTY_WINDOW_SKIP_MAX = 8;

function shiftDate(iso: string, deltaDays: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, (day ?? 1) + deltaDays));
  return utc.toISOString().slice(0, 10);
}

type BufferPage = {
  workouts: HealthWorkout[];
  hasMore: boolean;
  startDate: string;
};

type UseHealthWorkoutsOptions = {
  token: string | null;
  ready: boolean;
  initialWorkouts: HealthWorkout[];
  initialHasMore: boolean;
  initialEndDate: string | null;
};

export function useHealthWorkouts({
  token,
  ready,
  initialWorkouts,
  initialHasMore,
  initialEndDate,
}: UseHealthWorkoutsOptions) {
  const [workouts, setWorkouts] = useState<HealthWorkout[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [buffer, setBuffer] = useState<BufferPage | null>(null);
  const [prefetching, setPrefetching] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const seededRef = useRef(false);
  const nextEndRef = useRef<string | null>(null);
  const prefetchingRef = useRef(false);
  const seqRef = useRef(0);
  const bufferRef = useRef<BufferPage | null>(null);

  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);

  useEffect(() => {
    if (!ready || seededRef.current) return;
    seededRef.current = true;
    seqRef.current += 1;
    setSeeded(true);
    setWorkouts(initialWorkouts);
    setHasMore(initialHasMore);
    setBuffer(null);
    bufferRef.current = null;
    nextEndRef.current =
      initialHasMore && initialEndDate ? shiftDate(initialEndDate, -HEALTH_WORKOUT_PAGE_DAYS) : null;
  }, [ready, initialWorkouts, initialHasMore, initialEndDate]);

  const prefetch = useCallback(async () => {
    if (!token || prefetchingRef.current || bufferRef.current) return;
    const end = nextEndRef.current;
    if (!end) return;

    prefetchingRef.current = true;
    setPrefetching(true);
    const seq = seqRef.current;
    try {
      let pageEnd: string | null = end;
      let skipped = 0;
      while (pageEnd) {
        const page = await fetchHealthWorkouts(token, {
          end: pageEnd,
          days: HEALTH_WORKOUT_PAGE_DAYS,
        });
        if (seq !== seqRef.current) return;
        const pageWorkouts = page.workouts ?? [];
        if (pageWorkouts.length === 0 && page.has_more && skipped < EMPTY_WINDOW_SKIP_MAX) {
          skipped += 1;
          pageEnd = shiftDate(page.start_date, -1);
          continue;
        }
        const nextBuffer: BufferPage = {
          workouts: pageWorkouts,
          hasMore: page.has_more,
          startDate: page.start_date,
        };
        bufferRef.current = nextBuffer;
        setBuffer(nextBuffer);
        nextEndRef.current = page.has_more ? shiftDate(page.start_date, -1) : null;
        if (pageWorkouts.length === 0 && !page.has_more) {
          setHasMore(false);
        }
        break;
      }
    } catch {
      /* sentinel can retry via consumeBuffer */
    } finally {
      if (seq === seqRef.current) {
        prefetchingRef.current = false;
        setPrefetching(false);
      }
    }
  }, [token]);

  useEffect(() => {
    if (!ready || !token || !seededRef.current) return;
    if (buffer || !nextEndRef.current) return;
    void prefetch();
  }, [ready, token, buffer, prefetch, workouts, hasMore]);

  const consumeBuffer = useCallback(() => {
    const current = bufferRef.current;
    if (!current) {
      void prefetch();
      return;
    }
    if (current.workouts.length > 0) {
      setWorkouts((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...current.workouts.filter((item) => !seen.has(item.id))];
      });
    }
    setHasMore(current.hasMore);
    bufferRef.current = null;
    setBuffer(null);
    if (!current.hasMore) nextEndRef.current = null;
  }, [prefetch]);

  const canLoadMore = hasMore || buffer != null || nextEndRef.current != null;

  return {
    workouts,
    hasMore: canLoadMore,
    hasBuffer: buffer != null,
    prefetching,
    seeded,
    consumeBuffer,
  };
}
