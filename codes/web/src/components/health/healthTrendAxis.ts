import type { HealthSeriesPoint } from "@/types/api/views/health";

export function formatAxisNumber(n: number): string {
  if (Math.abs(n) >= 100) return String(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 10) return (Math.round(n * 10) / 10).toFixed(1);
  return String(Math.round(n * 100) / 100);
}

export function formatAxisDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

export function addDays(iso: string, days: number): string {
  const parts = iso.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2] + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateMs(iso: string): number {
  const parts = iso.split("-").map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

export function rangeTickDays(rangeDays: number): number[] {
  if (rangeDays === 7) return [1, 3, 5, 7];
  if (rangeDays === 30) return [1, 10, 20, 30];
  if (rangeDays === 90) return [1, 30, 60, 90];
  return [1, rangeDays];
}

export function calendarXAt(iso: string, start: string, end: string): number {
  const t0 = dateMs(start);
  const t1 = dateMs(end);
  if (t1 === t0) return 50;
  return ((dateMs(iso) - t0) / (t1 - t0)) * 100;
}

export function padSeriesToRange(
  points: HealthSeriesPoint[],
  rangeDays: number,
  rangeEnd: string,
): HealthSeriesPoint[] {
  const byDate = new Map(points.map((point) => [point.local_date, point]));
  const start = addDays(rangeEnd, -(rangeDays - 1));
  const out: HealthSeriesPoint[] = [];
  for (let i = 0; i < rangeDays; i += 1) {
    const localDate = addDays(start, i);
    out.push(byDate.get(localDate) ?? { local_date: localDate, value: null });
  }
  return out;
}

export function applySeriesAnchor(
  points: HealthSeriesPoint[],
  anchor: { local_date: string; value: number | null | undefined } | null | undefined,
): HealthSeriesPoint[] {
  if (!anchor || anchor.value == null) return points;
  let found = false;
  const next = points.map((point) => {
    if (point.local_date !== anchor.local_date) return point;
    found = true;
    return point.value != null ? point : { ...point, value: anchor.value };
  });
  if (found) return next;
  return [...next, { local_date: anchor.local_date, value: anchor.value }];
}
