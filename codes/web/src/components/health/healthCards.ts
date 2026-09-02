export const HEALTH_CARD_KEYS = [
  "steps",
  "active",
  "basal",
  "exercise",
  "stand",
  "rhr",
  "sleep",
  "weight",
  "hrv",
  "vo2",
  "recovery",
  "spo2",
] as const;

export type HealthCardKey = (typeof HEALTH_CARD_KEYS)[number];

export const HEALTH_CARD_LABELS: Record<HealthCardKey, string> = {
  steps: "步数",
  active: "活动消耗",
  basal: "静态消耗",
  exercise: "锻炼分钟",
  stand: "站立时间",
  rhr: "静息心率",
  sleep: "睡眠",
  weight: "最近体重",
  hrv: "HRV",
  vo2: "VO2 Max",
  recovery: "有氧恢复",
  spo2: "血氧",
};

export function formatHealthTrendY(metric: HealthCardKey, value: number): string {
  if (metric === "spo2") return `${Math.round(value * 100)}%`;
  if (Math.abs(value) >= 100) return String(Math.round(value));
  if (Number.isInteger(value)) return String(value);
  if (Math.abs(value) >= 10) return (Math.round(value * 10) / 10).toFixed(1);
  return String(Math.round(value * 100) / 100);
}

export const HEALTH_CARD_SERIES: Record<HealthCardKey, string> = {
  steps: "steps",
  active: "active_energy_kcal",
  basal: "basal_energy_kcal",
  exercise: "exercise_minutes",
  stand: "stand_hours",
  rhr: "resting_hr_bpm",
  sleep: "sleep_asleep_minutes",
  weight: "body_mass_kg",
  hrv: "hrv_median_ms",
  vo2: "vo2_max",
  recovery: "cardio_recovery_bpm",
  spo2: "spo2_avg",
};

export function valuedHours(
  rows: Array<{ hour: number; value?: number | null }> | null | undefined,
): Array<{ hour: number; value?: number | null }> | null {
  if (!rows?.some((point) => point.value != null)) return null;
  return rows;
}

export function hoursForHealthTrend(
  metric: HealthCardKey,
  detail: { hourly?: Array<{ hour: number; value?: number | null }> | null; hourly_heart_rate?: Array<{ hour: number; value?: number | null }> | null } | null,
): Array<{ hour: number; value?: number | null }> | null {
  if (!detail) return null;
  const rows =
    metric === "rhr" && (detail.hourly_heart_rate?.length ?? 0) > 0
      ? detail.hourly_heart_rate
      : detail.hourly;
  return valuedHours(rows);
}

export function isHealthCardKey(value: string): value is HealthCardKey {
  return (HEALTH_CARD_KEYS as readonly string[]).includes(value);
}
