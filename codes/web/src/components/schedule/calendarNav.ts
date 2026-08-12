import { pad2 } from "./taskUtils";

export type CalendarViewMode = "day" | "week" | "month" | "year";

export const CALENDAR_VIEW_MODES: Array<{ key: CalendarViewMode; label: string }> = [
  { key: "day", label: "日" },
  { key: "week", label: "周" },
  { key: "month", label: "月" },
  { key: "year", label: "年" },
];

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;
const lunarDateFormatter = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
  month: "short",
  day: "numeric",
});

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

export function weekdayLabel(dateKey: string): string {
  return `星期${WEEKDAY_LABELS[parseDateAnchor(dateKey).getDay()]}`;
}

function lunarDayName(day: number) {
  const digits = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  if (day <= 10) return `初${digits[day - 1]}`;
  if (day < 20) return `十${digits[day - 11]}`;
  if (day === 20) return "二十";
  if (day < 30) return `廿${digits[day - 21]}`;
  return "三十";
}

export function lunarDateLabel(dateKey: string): string {
  const parts = lunarDateFormatter.formatToParts(parseDateAnchor(dateKey));
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return Number.isFinite(day) && day > 0 ? `${month}${lunarDayName(day)}` : month;
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
  if (mode === "year") {
    return new Date(base.getFullYear() + delta, base.getMonth(), base.getDate());
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
  if (mode === "year") {
    return `${base.getFullYear()}年`;
  }
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
  if (mode === "year") return "上一年 / 下一年";
  return "上个月 / 下个月";
}

export function calendarTodayLabel(mode: CalendarViewMode): string {
  if (mode === "day") return "今天";
  if (mode === "week") return "本周";
  if (mode === "year") return "今年";
  return "本月";
}
