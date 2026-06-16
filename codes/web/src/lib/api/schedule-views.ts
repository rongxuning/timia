import { apiFetch } from "@/lib/api";
import type {
  MyScheduleDashboardView,
  ScheduleCalendarView,
  SchedulePriorityView,
  ScheduleScopeParams,
  ScheduleSwimlaneView,
} from "@/types/api/views/schedule";

function scopeQuery(params: ScheduleScopeParams): string {
  const q = new URLSearchParams({ scope: params.scope });
  if (params.scope === "project") {
    if (params.workspaceId) q.set("workspace_id", params.workspaceId);
    if (params.projectId) q.set("project_id", params.projectId);
  }
  return q.toString();
}

export function fetchScheduleCalendar(
  token: string,
  params: ScheduleScopeParams,
  month: string,
): Promise<ScheduleCalendarView> {
  const q = `${scopeQuery(params)}&month=${encodeURIComponent(month)}`;
  return apiFetch<ScheduleCalendarView>(`/views/schedule/calendar?${q}`, { token });
}

export function fetchScheduleSwimlane(token: string, params: ScheduleScopeParams): Promise<ScheduleSwimlaneView> {
  return apiFetch<ScheduleSwimlaneView>(`/views/schedule/swimlane?${scopeQuery(params)}`, { token });
}

export function fetchSchedulePriority(token: string, params: ScheduleScopeParams): Promise<SchedulePriorityView> {
  return apiFetch<SchedulePriorityView>(`/views/schedule/priority?${scopeQuery(params)}`, { token });
}

export function fetchMyScheduleDashboard(token: string): Promise<MyScheduleDashboardView> {
  return apiFetch<MyScheduleDashboardView>("/views/schedule/dashboard", { token });
}
