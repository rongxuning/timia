import {
  formatDateAnchor,
  parseDateAnchor,
  startOfDay,
  sundayWeekStart,
} from "@/components/schedule/calendarNav";

export const DEFAULT_PLAN_TIMEZONE = "Asia/Shanghai";

export function localDateInTimezone(now: Date, timeZone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return new Date(year, month - 1, day);
    }
  } catch {
    /* invalid IANA timezone */
  }
  return startOfDay(now);
}

export function periodStartForKind(periodKind: string, day: Date): Date {
  const base = startOfDay(day);
  if (periodKind === "week") return sundayWeekStart(base);
  if (periodKind === "month") return new Date(base.getFullYear(), base.getMonth(), 1);
  if (periodKind === "year") return new Date(base.getFullYear(), 0, 1);
  return base;
}

export function currentPeriodStart(periodKind: string, now: Date, timeZone: string): Date {
  return periodStartForKind(periodKind, localDateInTimezone(now, timeZone));
}

export function periodEndDate(periodKind: string, periodStart: Date): Date {
  const start = startOfDay(periodStart);
  if (periodKind === "week") {
    return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  }
  if (periodKind === "month") {
    return new Date(start.getFullYear(), start.getMonth() + 1, 0);
  }
  if (periodKind === "year") {
    return new Date(start.getFullYear(), 11, 31);
  }
  return start;
}

function formatZhDate(d: Date, withYear: boolean): string {
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  return withYear ? `${d.getFullYear()}年${md}` : md;
}

export function formatPeriodRange(periodKind: string, periodStart: Date): string {
  const start = startOfDay(periodStart);
  const end = periodEndDate(periodKind, start);
  if (periodKind === "month") {
    return `${start.getFullYear()}年${start.getMonth() + 1}月`;
  }
  if (periodKind === "year") {
    return `${start.getFullYear()}年`;
  }
  if (periodKind === "week") {
    const crossYear = start.getFullYear() !== end.getFullYear();
    return `${formatZhDate(start, true)} – ${formatZhDate(end, crossYear)}`;
  }
  return formatZhDate(start, true);
}

export function periodStartAnchor(periodKind: string, day: Date): string {
  return formatDateAnchor(periodStartForKind(periodKind, day));
}

export function parsePeriodStartAnchor(value: string): Date {
  return parseDateAnchor(value);
}

export { formatDateAnchor, sundayWeekStart };
