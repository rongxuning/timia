/** Resolve display pace (sec/km): API value, else duration / distance_km. */
export function resolveAvgPaceSecPerKm(input: {
  avg_pace_sec_per_km?: number | null;
  distance_m?: number | null;
  duration_seconds?: number | null;
}): number | null {
  if (input.avg_pace_sec_per_km != null) return input.avg_pace_sec_per_km;
  const distanceM = input.distance_m;
  const durationSeconds = input.duration_seconds;
  if (
    distanceM != null &&
    distanceM > 0 &&
    durationSeconds != null &&
    durationSeconds > 0
  ) {
    return durationSeconds / (distanceM / 1000);
  }
  return null;
}
