"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchHealthWorkoutDetail } from "@/lib/api/health-views";
import type { ApiError } from "@/lib/api";
import type { HealthWorkoutDetail } from "@/types/api/views/health";

function detailErrorMessage(item: Partial<ApiError> | undefined): string {
  if (item?.status === 404 || item?.message === "not_found") return "找不到这条训练";
  return item?.message ?? "加载详情失败";
}

export function useHealthWorkoutDetail(token: string | null, id: string) {
  const [detail, setDetail] = useState<HealthWorkoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (!token || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchHealthWorkoutDetail(token, id)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((item: Partial<ApiError>) => {
        if (!cancelled) {
          setDetail(null);
          setError(detailErrorMessage(item));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, id, reloadKey]);

  return { detail, loading, error, reload };
}
