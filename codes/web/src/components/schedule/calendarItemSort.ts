export type CalendarSortable = {
  id: string;
  status?: string | null;
  priority?: string | null;
  start_at?: string | null;
};

const CALENDAR_STATUS_RANK: Record<string, number> = {
  todo: 0,
  doing: 1,
  done: 2,
  archived: 3,
};

export function calendarStatusRank(status?: string | null): number {
  return CALENDAR_STATUS_RANK[status ?? ""] ?? 4;
}

function calendarPriorityRank(priority?: string | null): number {
  const value = (priority ?? "").trim();
  if (value === "1" || value === "2" || value === "3" || value === "4") {
    return Number(value);
  }
  return 0;
}

function calendarStartMs(startAt?: string | null): number {
  if (!startAt) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(startAt);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** 日历卡片：状态（待办→进行中→已完成→已归档），再按开始时间升序、优先级降序。 */
export function compareCalendarItems(a: CalendarSortable, b: CalendarSortable): number {
  const byStatus = calendarStatusRank(a.status) - calendarStatusRank(b.status);
  if (byStatus !== 0) return byStatus;
  const byStart = calendarStartMs(a.start_at) - calendarStartMs(b.start_at);
  if (byStart !== 0) return byStart;
  const byPriority = calendarPriorityRank(b.priority) - calendarPriorityRank(a.priority);
  if (byPriority !== 0) return byPriority;
  return a.id.localeCompare(b.id);
}
