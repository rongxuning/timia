export const IMPORT_WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;
/** 弹窗可见区域至少容纳的每日任务数，超出后横向滚动 */
export const IMPORT_VISIBLE_TASK_SLOTS = 5;

export type ImportPreviewTask = {
  slot_id: string;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location?: string | null;
};

export type ImportWeekDay = {
  key: string;
  weekdayLabel: string;
  monthDayLabel: string;
  tasks: ImportPreviewTask[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parsePeriodDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function sundayOf(d: Date): Date {
  const base = startOfLocalDay(d);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay());
}

export function formatImportTaskClockRange(
  startAt: string,
  endAt: string,
  allDay: boolean,
): string {
  if (allDay) return "全天";
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  return `${pad2(start.getHours())}:${pad2(start.getMinutes())}–${pad2(end.getHours())}:${pad2(end.getMinutes())}`;
}

export function compareImportTasks(a: ImportPreviewTask, b: ImportPreviewTask): number {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  const startDiff = new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
  if (startDiff !== 0) return startDiff;
  const endDiff = new Date(a.end_at).getTime() - new Date(b.end_at).getTime();
  if (endDiff !== 0) return endDiff;
  return a.title.localeCompare(b.title, "zh");
}

export function buildImportWeekDays(
  periodStart: string,
  tasks: ImportPreviewTask[],
): ImportWeekDay[] {
  const weekStart = sundayOf(parsePeriodDate(periodStart));
  const days: ImportWeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate() + index,
    );
    return {
      key: formatDayKey(date),
      weekdayLabel: IMPORT_WEEKDAY_LABELS[index],
      monthDayLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      tasks: [],
    };
  });

  for (const task of tasks) {
    const start = new Date(task.start_at);
    if (Number.isNaN(start.getTime())) continue;
    const key = formatDayKey(start);
    const day = days.find((item) => item.key === key) ?? days[start.getDay()];
    day.tasks.push(task);
  }

  for (const day of days) {
    day.tasks.sort(compareImportTasks);
  }
  return days;
}

/** Empty set means every card is selected. */
export function isImportTaskSelected(slotId: string, unselected: Set<string>): boolean {
  return !unselected.has(slotId);
}

export function toggleUnselectedSlotId(unselected: Set<string>, slotId: string): Set<string> {
  const next = new Set(unselected);
  if (next.has(slotId)) next.delete(slotId);
  else next.add(slotId);
  return next;
}

export function selectedImportSlotIds(
  tasks: ImportPreviewTask[],
  unselected: Set<string>,
): string[] {
  return tasks
    .map((task) => task.slot_id)
    .filter((slotId) => Boolean(slotId) && !unselected.has(slotId));
}
