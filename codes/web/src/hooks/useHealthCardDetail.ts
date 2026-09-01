"use client";

import { useEffect, useState } from "react";
import { fetchHealthCardDetail } from "@/lib/api/health-views";
import type { HealthCardDetail } from "@/types/api/views/health";

export function useHealthCardDetail(
  token: string | null,
  metric: string,
  params: { date?: string | null; range?: number | null },
) {
  const [detail, setDetail] = useState<HealthCardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !metric) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHealthCardDetail(token, metric, {
      date: params.range ? undefined : params.date ?? undefined,
      range: params.range ?? undefined,
    })
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((item: { message?: string }) => {
        if (!cancelled) setError(item?.message ?? "加载详情失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, metric, params.date, params.range]);

  return { detail, loading, error };
}
