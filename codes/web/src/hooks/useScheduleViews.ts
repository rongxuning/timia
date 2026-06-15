"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMyScheduleDashboard,
  fetchScheduleCalendar,
  fetchSchedulePriority,
  fetchScheduleSwimlane,
} from "@/lib/api/schedule-views";
import type {
  MyScheduleDashboardView,
  ScheduleCalendarView,
  SchedulePriorityView,
  ScheduleScopeParams,
  ScheduleSwimlaneView,
} from "@/types/api/views/schedule";

function formatMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type UseScheduleViewsOptions = {
  token: string | null;
  scope: ScheduleScopeParams;
  /** 仅 scope=me 时拉取仪表盘 */
  withDashboard?: boolean;
};

export function useScheduleViews({ token, scope, withDashboard = false }: UseScheduleViewsOptions) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [dashboard, setDashboard] = useState<MyScheduleDashboardView | null>(null);
  const [calendar, setCalendar] = useState<ScheduleCalendarView | null>(null);
  const [swimlane, setSwimlane] = useState<ScheduleSwimlaneView | null>(null);
  const [priority, setPriority] = useState<SchedulePriorityView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const monthKey = useMemo(() => formatMonth(calendarMonth), [calendarMonth]);
  const scopeKey = useMemo(
    () => `${scope.scope}:${scope.workspaceId ?? ""}:${scope.projectId ?? ""}`,
    [scope.scope, scope.workspaceId, scope.projectId],
  );

  const reloadAll = useCallback(async () => {
    if (!token) return;
    setError(null);
    const tasks: Promise<void>[] = [
      fetchScheduleCalendar(token, scope, monthKey).then(setCalendar),
      fetchScheduleSwimlane(token, scope).then(setSwimlane),
      fetchSchedulePriority(token, scope).then(setPriority),
    ];
    if (withDashboard) {
      tasks.push(fetchMyScheduleDashboard(token).then(setDashboard));
    }
    await Promise.all(tasks);
  }, [token, scope, monthKey, withDashboard]);

  const reloadCalendar = useCallback(async () => {
    if (!token) return;
    const data = await fetchScheduleCalendar(token, scope, monthKey);
    setCalendar(data);
  }, [token, scope, monthKey]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    reloadAll()
      .catch((e: { message?: string }) => {
        if (!cancelled) setError(e?.message ?? "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, scopeKey, monthKey, withDashboard, reloadAll]);

  return {
    calendarMonth,
    setCalendarMonth,
    monthKey,
    dashboard,
    calendar,
    swimlane,
    priority,
    loading,
    error,
    setError,
    reloadAll,
    reloadCalendar,
  };
}
