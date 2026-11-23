/** Date helpers for the assets calendar and the three balance curves. */

export type DateRange = { start: string; end: string };

export type CalendarCell = { date: string; day: number } | null;

export type DatedBalance = {
  as_of: string;
  assets_minor: number;
  liabilities_minor: number;
  net_worth_minor: number;
};

export type ChartPoint = { as_of: string; value: number };

export type PlotPoint = ChartPoint & { x: number; y: number };

export type LineChartLayout = {
  width: number;
  height: number;
  baseline: number;
  coords: PlotPoint[];
  line: string;
  area: string;
  min: number;
  max: number;
};

export const CHART_WIDTH = 640;
export const CHART_HEIGHT = 168;

const PAD = { top: 16, right: 12, bottom: 16, left: 12 };

/** 1 = Monday … 7 = Sunday. Same numbering as `src/lib/weekStart.ts`. */
function weekdayNumber(date: Date): number {
  const js = date.getDay();
  return js === 0 ? 7 : js;
}

function normalizeWeekStart(value: number): 1 | 6 | 7 {
  return value === 6 || value === 7 ? value : 1;
}

export function isoToday(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const next = new Date(year || 1970, (monthNum || 1) - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(month: string, today: string): DateRange {
  const [year, monthNum] = month.split("-").map(Number);
  const last = new Date(year || 1970, monthNum || 1, 0).getDate();
  const start = `${month}-01`;
  const monthEnd = `${month}-${String(last).padStart(2, "0")}`;
  if (start > today) return { start: today, end: today };
  return { start, end: monthEnd > today ? today : monthEnd };
}

export function orderedRange(a: string, b: string): DateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** First click arms the end date. The committed range, and the curves, stay put until the second click. */
export function nextRangeAfterPick(
  current: DateRange,
  pending: string | null,
  picked: string,
): { range: DateRange; pending: string | null } {
  if (!pending) return { range: current, pending: picked };
  return { range: orderedRange(pending, picked), pending: null };
}

/**
 * Month arrows page the grid. With no date waiting for an end, they also move the
 * curve window to that month, clamped so it never runs past today.
 */
export function monthStep(
  month: string,
  delta: number,
  today: string,
  pending: string | null,
): { month: string; range: DateRange | null } {
  const next = shiftMonth(month, delta);
  if (delta > 0 && next > monthKey(today)) return { month, range: null };
  if (pending) return { month: next, range: null };
  return { month: next, range: monthRange(next, today) };
}

export function buildCalendarCells(month: string, weekStartsOn: number): CalendarCell[] {
  const [year, monthNum] = month.split("-").map(Number);
  const first = new Date(year || 1970, (monthNum || 1) - 1, 1);
  const leading = (weekdayNumber(first) - normalizeWeekStart(weekStartsOn) + 7) % 7;
  const total = new Date(year || 1970, monthNum || 1, 0).getDate();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < leading; index += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) {
    cells.push({
      date: `${year}-${String(monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function weekdayHeaderLabels(locale: string, weekStartsOn: number): string[] {
  const start = normalizeWeekStart(weekStartsOn);
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  return Array.from({ length: 7 }, (_, index) => {
    const weekday = ((start - 1 + index) % 7) + 1;
    return fmt.format(new Date(2026, 10, 1 + weekday));
  });
}

/** Start, end, and Mondays between them when the span is longer than seven days.
 *  A Monday that would sit on an endpoint label is left out.
 */
export function chartAxisDates(dates: readonly string[]): string[] {
  if (dates.length === 0) return [];
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (!start || !end || start === end) return [start];
  const startDate = utcDay(start);
  const endDate = utcDay(end);
  const span = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  if (span <= 7) return [start, end];
  const indexOf = new Map(dates.map((date, index) => [date, index]));
  const last = dates.length - 1;
  const mondays: string[] = [];
  const cursor = new Date(startDate);
  const weekday = cursor.getUTCDay();
  cursor.setUTCDate(cursor.getUTCDate() + (weekday === 1 ? 7 : (8 - weekday) % 7));
  while (cursor.getTime() < endDate.getTime()) {
    const iso = utcIso(cursor);
    const index = indexOf.get(iso);
    if (index != null && mondayFits(index, last, mondays, indexOf)) mondays.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return [start, ...mondays, end];
}

/** Keep a Monday off the endpoint labels, which already occupy the two ends. */
function mondayFits(index: number, last: number, kept: string[], indexOf: Map<string, number>): boolean {
  if (last <= 0) return false;
  const ratio = index / last;
  if (ratio < 0.12 || ratio > 1 - 0.12) return false;
  return kept.every((date) => Math.abs(index - (indexOf.get(date) ?? 0)) / last >= 0.12);
}

function utcDay(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year || 1970, (month || 1) - 1, day || 1));
}

function utcIso(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatChartDate(iso: string, locale: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}

/** Day-of-month only, e.g. "1" / "23". */
export function formatChartDay(iso: string): string {
  const day = Number(iso.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? String(day) : iso;
}

/** Month label for an axis tick, e.g. "11月" / "Nov". */
export function formatChartMonth(iso: string, locale: string): string {
  const [year, month] = iso.split("-").map(Number);
  if (!year || !month) return iso.slice(0, 7);
  return new Intl.DateTimeFormat(locale, { month: "short" }).format(new Date(year, month - 1, 1));
}

export type ChartPointDateLabel = {
  date: string;
  day: string;
  /** Set on the first point of each calendar month in the series. */
  month: string | null;
};

/**
 * One label per data point: day number always, month once when that month first appears.
 */
export function chartPointDateLabels(dates: readonly string[]): ChartPointDateLabel[] {
  const seen = new Set<string>();
  return dates.map((date) => {
    const key = date.slice(0, 7);
    const firstOfMonth = !seen.has(key);
    if (firstOfMonth) seen.add(key);
    return {
      date,
      day: formatChartDay(date),
      month: firstOfMonth ? key : null,
    };
  });
}

export function formatMonthTitle(month: string, locale: string): string {
  const [year, monthNum] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(year || 1970, (monthNum || 1) - 1, 1),
  );
}

export function filterDailySeries<T extends { as_of: string }>(series: T[], start: string, end: string): T[] {
  const range = orderedRange(start, end);
  return series.filter((point) => point.as_of >= range.start && point.as_of <= range.end);
}

export function lineChartLayout(
  points: ChartPoint[],
  width = CHART_WIDTH,
  height = CHART_HEIGHT,
): LineChartLayout | null {
  if (points.length === 0) return null;
  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const slack = min === 0 ? 1 : Math.abs(min) * 0.08;
    min -= slack;
    max += slack;
  } else {
    const slack = (max - min) * 0.08;
    min -= slack;
    max += slack;
  }
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const span = max - min;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (index / (points.length - 1)) * innerW;
    const y = PAD.top + (1 - (point.value - min) / span) * innerH;
    return { as_of: point.as_of, value: point.value, x, y };
  });
  const line =
    coords.length > 1
      ? coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ")
      : "";
  const baseline = PAD.top + innerH;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area =
    line === "" ? "" : `${line} L${last.x.toFixed(2)} ${baseline.toFixed(2)} L${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`;
  return { width, height, baseline, coords, line, area, min, max };
}

/** Map a pointer into a viewBox drawn with xMidYMid meet, ignoring the letterbox. */
export function pointerXInViewBox(
  offsetX: number,
  elementWidth: number,
  elementHeight: number,
  viewWidth: number,
  viewHeight: number,
): number {
  if (elementWidth <= 0 || elementHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return 0;
  const scale = Math.min(elementWidth / viewWidth, elementHeight / viewHeight);
  const contentWidth = viewWidth * scale;
  const padX = (elementWidth - contentWidth) / 2;
  const local = Math.min(Math.max(offsetX - padX, 0), contentWidth);
  return (local / contentWidth) * viewWidth;
}

export type BalanceLine = {
  kind: "asset" | "liability";
  display_minor: number | null;
  include_in_net_worth: boolean;
};

/** Same rule as the page summary: included holdings only, assets minus liabilities. */
export function accountBalanceTotals(lines: BalanceLine[]): {
  assets_minor: number;
  liabilities_minor: number;
  net_worth_minor: number;
} {
  let assets = 0;
  let liabilities = 0;
  for (const line of lines) {
    if (line.display_minor == null || !line.include_in_net_worth) continue;
    if (line.kind === "asset") assets += line.display_minor;
    else liabilities += line.display_minor;
  }
  return { assets_minor: assets, liabilities_minor: liabilities, net_worth_minor: assets - liabilities };
}

export function nearestChartIndex(coords: readonly { x: number }[], x: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let index = 0; index < coords.length; index += 1) {
    const dist = Math.abs(coords[index].x - x);
    if (dist < bestDist) {
      best = index;
      bestDist = dist;
    }
  }
  return best;
}
