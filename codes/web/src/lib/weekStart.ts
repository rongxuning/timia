/** Weekday numbers: 1=Monday … 7=Sunday. Week starts are Monday, Saturday, or Sunday. */

export const MONDAY = 1;
export const SATURDAY = 6;
export const SUNDAY = 7;
export const DEFAULT_WEEK_START = MONDAY;

const SHORT = ["", "一", "二", "三", "四", "五", "六", "日"] as const;
const NAME = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

export function isWeekStartDay(value: number | null | undefined): value is 1 | 6 | 7 {
  return value === MONDAY || value === SATURDAY || value === SUNDAY;
}

export function normalizeWeekStart(value: number | null | undefined): 1 | 6 | 7 {
  return isWeekStartDay(value) ? value : DEFAULT_WEEK_START;
}

/** 1=Monday … 7=Sunday. JS `getDay()` is 0=Sunday. */
export function weekdayNumber(d: Date): number {
  const js = d.getDay();
  return js === 0 ? SUNDAY : js;
}

export function weekdayShort(number: number): string {
  return SHORT[number] ?? "";
}

export function weekdayName(number: number): string {
  return NAME[number] ?? "";
}

export function weekStartDate(d: Date, startsOn: number = DEFAULT_WEEK_START): Date {
  const delta = (weekdayNumber(d) - normalizeWeekStart(startsOn) + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - delta);
}

export function weekdayHeaderLabels(startsOn: number = DEFAULT_WEEK_START): string[] {
  const start = normalizeWeekStart(startsOn);
  return Array.from({ length: 7 }, (_, index) => weekdayShort(((start - 1 + index) % 7) + 1));
}

export function weekEndNumber(startsOn: number): number {
  const start = normalizeWeekStart(startsOn);
  return start === MONDAY ? SUNDAY : start - 1;
}

export function leadingWeekdayBlanks(firstOfMonth: Date, startsOn: number = DEFAULT_WEEK_START): number {
  return (weekdayNumber(firstOfMonth) - normalizeWeekStart(startsOn) + 7) % 7;
}
