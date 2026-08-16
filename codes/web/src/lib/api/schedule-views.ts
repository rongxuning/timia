import { apiFetch } from "@/lib/api";
import type {
  CalendarViewMode,
  MyScheduleDashboardView,
  ScheduleCalendarView,
  ScheduleOverdueView,
  SchedulePriorityView,
  ScheduleScopeParams,
  ScheduleSwimlaneView,
  ScheduleUndatedView,
} from "@/types/api/views/schedule";

function formatDateAnchor(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calendarTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
}

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
  options: { view: CalendarViewMode; anchor: Date },
): Promise<ScheduleCalendarView> {
  const q = new URLSearchParams(scopeQuery(params));
  q.set("view", options.view);
  q.set("anchor", formatDateAnchor(options.anchor));
  q.set("timezone", calendarTimeZone());
  return apiFetch<ScheduleCalendarView>(`/views/schedule/calendar?${q.toString()}`, { token });
}

export function fetchScheduleSwimlane(token: string, params: ScheduleScopeParams): Promise<ScheduleSwimlaneView> {
  return apiFetch<ScheduleSwimlaneView>(`/views/schedule/swimlane?${scopeQuery(params)}`, { token });
}

export function fetchSchedulePriority(token: string, params: ScheduleScopeParams): Promise<SchedulePriorityView> {
  return apiFetch<SchedulePriorityView>(`/views/schedule/priority?${scopeQuery(params)}`, { token });
}

export function fetchScheduleUndated(token: string, params: ScheduleScopeParams): Promise<ScheduleUndatedView> {
  return apiFetch<ScheduleUndatedView>(`/views/schedule/undated?${scopeQuery(params)}`, { token });
}

export function fetchScheduleOverdue(
  token: string,
  params: ScheduleScopeParams,
  options: { timezone?: string; limit?: number; offset?: number } = {},
): Promise<ScheduleOverdueView> {
  const q = new URLSearchParams(scopeQuery(params));
  q.set("timezone", options.timezone ?? calendarTimeZone());
  if (options.limit != null) q.set("limit", String(options.limit));
  if (options.offset != null) q.set("offset", String(options.offset));
  return apiFetch<ScheduleOverdueView>(`/views/schedule/overdue?${q.toString()}`, { token });
}

export function fetchMyScheduleDashboard(token: string): Promise<MyScheduleDashboardView> {
  return apiFetch<MyScheduleDashboardView>("/views/schedule/dashboard", { token });
}
