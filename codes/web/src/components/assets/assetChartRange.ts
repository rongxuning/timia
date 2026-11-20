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

export function formatChartDate(iso: string, locale: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(
    new Date(year, month - 1, day),
  );
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

export function nearestChartIndex(coords: PlotPoint[], x: number): number {
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
