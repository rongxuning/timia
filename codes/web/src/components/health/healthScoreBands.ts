import type { HealthCardKey } from "@/components/health/healthCards";
import type { HealthEnergyTargets } from "@/types/api/views/health";

export type ScoreTone = "high" | "good" | "mid" | "low";

export type ScoreScale =
  | { kind: "linear"; target: number }
  | { kind: "sleep" }
  | { kind: "rhr" }
  | { kind: "bmi"; heightCm: number }
  | { kind: "vo2" }
  | { kind: "spo2" }
  | { kind: "none" };

export type ScoreBand = {
  y0: number;
  y1: number;
  tone: ScoreTone;
};

export const SCORE_BAND_FILL: Record<ScoreTone, string> = {
  high: "#E8F5E9",
  good: "#E3F2FD",
  mid: "#F3D98A",
  low: "#FFEBEE",
};

export const SCORE_BAND_ROW_CLASS: Record<ScoreTone | "none", string> = {
  high: "bg-[#E8F5E9]",
  good: "bg-[#E3F2FD]",
  mid: "bg-[#F3D98A]",
  low: "bg-[#FFEBEE]",
  none: "bg-white",
};

export function toneForScore(score: number | null | undefined): ScoreTone | "none" {
  if (score == null) return "none";
  if (score >= 90) return "high";
  if (score >= 76) return "good";
  if (score >= 60) return "mid";
  return "low";
}

export const SCORE_BAND_LEGEND: Array<{ tone: ScoreTone; label: string; range: string }> = [
  { tone: "high", label: "绿", range: "90–100 分" },
  { tone: "good", label: "蓝", range: "76–89 分" },
  { tone: "mid", label: "黄", range: "60–75 分" },
  { tone: "low", label: "红", range: "0–59 分" },
];

export function scoreScaleForMetric(
  metric: HealthCardKey,
  energyTargets?: HealthEnergyTargets | null,
  heightCm?: number | null,
): ScoreScale {
  switch (metric) {
    case "steps":
      return { kind: "linear", target: 10000 };
    case "active":
      return { kind: "linear", target: energyTargets?.active_target_kcal ?? 500 };
    case "basal":
      return energyTargets?.bmr_kcal
        ? { kind: "linear", target: energyTargets.bmr_kcal }
        : { kind: "none" };
    case "exercise":
      return { kind: "linear", target: 30 };
    case "stand":
      return { kind: "linear", target: 12 };
    case "rhr":
      return { kind: "rhr" };
    case "sleep":
      return { kind: "sleep" };
    case "hrv":
      return { kind: "linear", target: 60 };
    case "vo2":
      return { kind: "vo2" };
    case "recovery":
      return { kind: "linear", target: 30 };
    case "spo2":
      return { kind: "spo2" };
    case "weight":
      return heightCm != null && heightCm > 0
        ? { kind: "bmi", heightCm }
        : { kind: "none" };
  }
}

export function scoreBandsForScale(scale: ScoreScale, yMin: number, yMax: number): ScoreBand[] {
  if (scale.kind === "none" || yMax <= yMin) return [];
  if (scale.kind === "linear") {
    const target = scale.target;
    return clipBands(
      [
        { y0: Number.NEGATIVE_INFINITY, y1: target * 0.6, tone: "low" },
        { y0: target * 0.6, y1: target * 0.76, tone: "mid" },
        { y0: target * 0.76, y1: target * 0.9, tone: "good" },
        { y0: target * 0.9, y1: Number.POSITIVE_INFINITY, tone: "high" },
      ],
      yMin,
      yMax,
    );
  }
  if (scale.kind === "sleep") {
    const hours = (value: number) => value * 60;
    return clipBands(
      [
        { y0: Number.NEGATIVE_INFINITY, y1: hours(4.2), tone: "low" },
        { y0: hours(4.2), y1: hours(5.32), tone: "mid" },
        { y0: hours(5.32), y1: hours(6.3), tone: "good" },
        { y0: hours(6.3), y1: hours(9.5), tone: "high" },
        { y0: hours(9.5), y1: hours(10.2), tone: "good" },
        { y0: hours(10.2), y1: hours(11), tone: "mid" },
        { y0: hours(11), y1: Number.POSITIVE_INFINITY, tone: "low" },
      ],
      yMin,
      yMax,
    );
  }
  if (scale.kind === "rhr") {
    const below = (score: number) => 50 - (100 - score) / 2;
    const above = (score: number) => 65 + (100 - score) / 2.2;
    return clipBands(
      [
        { y0: Number.NEGATIVE_INFINITY, y1: below(60), tone: "low" },
        { y0: below(60), y1: below(76), tone: "mid" },
        { y0: below(76), y1: below(90), tone: "good" },
        { y0: below(90), y1: above(90), tone: "high" },
        { y0: above(90), y1: above(76), tone: "good" },
        { y0: above(76), y1: above(60), tone: "mid" },
        { y0: above(60), y1: Number.POSITIVE_INFINITY, tone: "low" },
      ],
      yMin,
      yMax,
    );
  }
  if (scale.kind === "bmi") {
    // China adult BMI (WS/T 428): normal 18.5–23.9; chart axis is kg.
    const m2 = (scale.heightCm / 100) ** 2;
    const kg = (bmi: number) => bmi * m2;
    const below = (score: number) => kg(18.5 - (100 - score) / 20);
    const above = (score: number) => kg(24 + (100 - score) / 10);
    return clipBands(
      [
        { y0: Number.NEGATIVE_INFINITY, y1: below(60), tone: "low" },
        { y0: below(60), y1: below(76), tone: "mid" },
        { y0: below(76), y1: below(90), tone: "good" },
        { y0: below(90), y1: above(90), tone: "high" },
        { y0: above(90), y1: above(76), tone: "good" },
        { y0: above(76), y1: above(60), tone: "mid" },
        { y0: above(60), y1: Number.POSITIVE_INFINITY, tone: "low" },
      ],
      yMin,
      yMax,
    );
  }
  if (scale.kind === "vo2") {
    const at = (score: number) => 20 + (30 * score) / 100;
    return clipBands(
      [
        { y0: Number.NEGATIVE_INFINITY, y1: at(60), tone: "low" },
        { y0: at(60), y1: at(76), tone: "mid" },
        { y0: at(76), y1: at(90), tone: "good" },
        { y0: at(90), y1: Number.POSITIVE_INFINITY, tone: "high" },
      ],
      yMin,
      yMax,
    );
  }
  const at = (score: number) => 0.9 + (0.08 * score) / 100;
  return clipBands(
    [
      { y0: Number.NEGATIVE_INFINITY, y1: at(60), tone: "low" },
      { y0: at(60), y1: at(76), tone: "mid" },
      { y0: at(76), y1: at(90), tone: "good" },
      { y0: at(90), y1: Number.POSITIVE_INFINITY, tone: "high" },
    ],
    yMin,
    yMax,
  );
}

export function scoreSleepMinutes(minutes: number | null | undefined): number | null {
  if (minutes == null) return null;
  const hours = minutes / 60;
  if (hours >= 7 && hours <= 9) return 100;
  if (hours < 7) return clampScore((100 * hours) / 7);
  return clampScore(100 - (hours - 9) * 20);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clipBands(bands: ScoreBand[], yMin: number, yMax: number): ScoreBand[] {
  return bands
    .map((band) => ({
      ...band,
      y0: Math.max(band.y0, yMin),
      y1: Math.min(band.y1, yMax),
    }))
    .filter((band) => band.y1 > band.y0);
}
