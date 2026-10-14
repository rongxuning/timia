export type SplitMetricRow = {
  duration_seconds: number;
  avg_hr_bpm?: number | null;
  avg_cadence_spm?: number | null;
  is_total?: boolean;
};

export type OffsetPoint = {
  offset_seconds: number;
  value: number;
};

const MAX_HOLD_S = 180;
const LAST_HOLD_S = 5;

function seriesCovers(points: OffsetPoint[] | null | undefined, elapsed: number): boolean {
  if (!points || points.length < 2 || elapsed <= 0) return false;
  let min = points[0].offset_seconds;
  let max = min;
  for (const point of points) {
    if (point.offset_seconds < min) min = point.offset_seconds;
    if (point.offset_seconds > max) max = point.offset_seconds;
  }
  const span = max - min;
  if (span <= 0) return false;
  const ratio = elapsed / span;
  return ratio >= 0.5 && ratio <= 2;
}

/** Time-weighted mean. Each sample holds until the next one. */
export function averageSeriesInWindow(
  points: OffsetPoint[] | null | undefined,
  t0: number,
  t1: number,
): number | null {
  if (!points || points.length === 0 || t1 <= t0) return null;
  const ordered = [...points].sort((a, b) => a.offset_seconds - b.offset_seconds);
  let total = 0;
  let weight = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const start = ordered[index].offset_seconds;
    const end =
      index < ordered.length - 1
        ? Math.min(ordered[index + 1].offset_seconds, start + MAX_HOLD_S)
        : start + LAST_HOLD_S;
    const lo = Math.max(start, t0);
    const hi = Math.min(Math.max(end, start + 0.001), t1);
    if (hi <= lo) continue;
    const span = hi - lo;
    total += ordered[index].value * span;
    weight += span;
  }
  if (weight <= 0) return null;
  return total / weight;
}

/**
 * Fill lap heart rate and cadence from series when every lap of that metric is empty.
 * Keeps server values when any lap already has one.
 */
export function withSplitSeriesMetrics<T extends SplitMetricRow>(
  splits: T[] | null | undefined,
  heartRate: OffsetPoint[] | null | undefined,
  cadence: OffsetPoint[] | null | undefined,
): T[] | null | undefined {
  if (!splits || splits.length === 0) return splits;
  const laps = splits.filter((row) => !row.is_total);
  const elapsed = laps.reduce((sum, row) => sum + row.duration_seconds, 0);
  const fillHr = laps.every((row) => row.avg_hr_bpm == null) && seriesCovers(heartRate, elapsed);
  const fillCadence =
    laps.every((row) => row.avg_cadence_spm == null) && seriesCovers(cadence, elapsed);
  if (!fillHr && !fillCadence) return splits;

  let cursor = 0;
  return splits.map((row) => {
    if (row.is_total) return row;
    const t0 = cursor;
    const t1 = cursor + row.duration_seconds;
    cursor = t1;
    const avgHr = fillHr ? averageSeriesInWindow(heartRate, t0, t1) : row.avg_hr_bpm;
    const avgCadence = fillCadence ? averageSeriesInWindow(cadence, t0, t1) : row.avg_cadence_spm;
    if (avgHr === row.avg_hr_bpm && avgCadence === row.avg_cadence_spm) return row;
    return { ...row, avg_hr_bpm: avgHr, avg_cadence_spm: avgCadence };
  });
}
