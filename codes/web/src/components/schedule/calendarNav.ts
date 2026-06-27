import { pad2 } from "./taskUtils";

export type CalendarViewMode = "day" | "week" | "month";

export const CALENDAR_VIEW_MODES: Array<{ key: CalendarViewMode; label: string }> = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
];

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDateAnchor(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateAnchor(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function sundayWeekStart(d: Date): Date {
  const base = startOfDay(d);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - base.getDay());
}

export function shiftCalendarAnchor(anchor: Date, mode: CalendarViewMode, delta: -1 | 1): Date {
  const base = startOfDay(anchor);
  if (mode === "day") {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
  }
  if (mode === "week") {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta * 7);
  }
  const targetMonth = new Date(base.getFullYear(), base.getMonth() + delta, 1);
  const day = Math.min(base.getDate(), daysInMonth(targetMonth.getFullYear(), targetMonth.getMonth()));
  return new Date(targetMonth.getFullYear(), targetMonth.getMonth(), day);
}

function formatMonthDay(d: Date, withYear: boolean) {
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withYear ? `${d.getFullYear()}年${md}` : md;
}

export function calendarTitle(anchor: Date, mode: CalendarViewMode): string {
  const base = startOfDay(anchor);
  if (mode === "month") {
    return `${base.getFullYear()}年${base.getMonth() + 1}月`;
  }
  if (mode === "day") {
    return `${formatMonthDay(base, true)} 周${WEEKDAY_LABELS[base.getDay()]}`;
  }
  const weekStart = sundayWeekStart(base);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const crossYear = weekStart.getFullYear() !== weekEnd.getFullYear();
  return `${formatMonthDay(weekStart, crossYear)} – ${formatMonthDay(weekEnd, crossYear)}`;
}

export function calendarNavStepLabel(mode: CalendarViewMode): string {
  if (mode === "day") return "上一天 / 下一天";
  if (mode === "week") return "上一周 / 下一周";
  return "上个月 / 下个月";
}

export function calendarTodayLabel(mode: CalendarViewMode): string {
  if (mode === "day") return "今天";
  if (mode === "week") return "本周";
  return "本月";
}
