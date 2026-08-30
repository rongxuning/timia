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

export function isHealthCardKey(value: string): value is HealthCardKey {
  return (HEALTH_CARD_KEYS as readonly string[]).includes(value);
}
