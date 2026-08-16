export type TimedValue = string | null | undefined;

function isMissingTime(value: TimedValue): boolean {
  return value == null || value.trim() === "";
}

export function isUndatedTask(item: { start_at?: TimedValue; end_at?: TimedValue }): boolean {
  return isMissingTime(item.start_at) && isMissingTime(item.end_at);
}

export function listUndatedTasks<T extends { start_at?: TimedValue; end_at?: TimedValue }>(items: T[]): T[] {
  return items.filter(isUndatedTask);
}

export function filterTasksByProject<T extends { project_id: string }>(items: T[], projectId: string): T[] {
  return items.filter((item) => item.project_id === projectId);
}

export function listProjectUndatedTasks<
  T extends { project_id: string; start_at?: TimedValue; end_at?: TimedValue },
>(items: T[], projectId: string): T[] {
  return filterTasksByProject(listUndatedTasks(items), projectId);
}

export function matchesTaskTitle(title: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return title.toLowerCase().includes(needle);
}

export function filterTasksByTitle<T extends { title: string }>(items: T[], query: string): T[] {
  return items.filter((item) => matchesTaskTitle(item.title, query));
}

export function canClearScheduleByDrop(item: {
  status?: string | null;
  start_at?: TimedValue;
  end_at?: TimedValue;
}): boolean {
  return item.status === "todo" && !isUndatedTask(item);
}
