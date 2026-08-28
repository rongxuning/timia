import type { components } from "@/types/api/generated";

export type HealthCurrent = components["schemas"]["HealthCurrentOut"];
export type HealthWorkout = components["schemas"]["HealthWorkoutOut"];
export type HealthSeriesPoint = components["schemas"]["HealthSeriesPointOut"];
export type HealthInsight = components["schemas"]["HealthInsightOut"];
export type HealthWorkoutsPage = components["schemas"]["HealthWorkoutsPageOut"];

export type HealthCalendarDay = {
  local_date: string;
  has_metrics: boolean;
  has_workout: boolean;
  has_insight: boolean;
};

export type MyHealthView = {
  timezone: string;
  mode?: "day" | "range" | string;
  selected_date?: string | null;
  range_days?: number | null;
  month?: string;
  calendar_days?: HealthCalendarDay[];
  current: HealthCurrent;
  totals?: HealthCurrent | null;
  scores?: Record<string, number | null>;
  score_formulas?: Record<string, { formula: string; hint: string }>;
  card_order?: string[];
  recent_workouts?: HealthWorkout[];
  workout_start_date?: string | null;
  workout_end_date?: string | null;
  workout_has_more?: boolean;
  series?: Record<string, HealthSeriesPoint[]>;
  insight?: HealthInsight | null;
  insights?: HealthInsight[];
};
