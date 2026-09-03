"use client";

import { useId, useState } from "react";
import type { HealthWorkoutDetail } from "@/types/api/views/health";

type ZoneShare = NonNullable<HealthWorkoutDetail["heart_rate_zones"]>[number];

type WorkoutZoneBarProps = {
  title: string;
  zones: ZoneShare[] | null | undefined;
  zoneName: (zone: ZoneShare["zone"]) => string;
  formatRange: (lo: number, hi: number) => string;
  /** Optional second range column (e.g. bpm for heart-rate zones). */
  formatValueRange?: (lo: number, hi: number) => string;
  /** Heart-rate / pace zones use blue→red; default keeps the indigo ramp. */
  palette?: "hr" | "pace" | "default";
  defaultOpen?: boolean;
  showEmpty?: boolean;
};

/** Soft fills for segmented bar + zone swatches (1→5 / E→R). */
export const HR_ZONE_BAR_FILL = [
  "bg-blue-500",
  "bg-cyan-400",
  "bg-green-500",
  "bg-orange-400",
  "bg-red-500",
] as const;

export const PACE_ZONE_BAR_FILL = HR_ZONE_BAR_FILL;

/** Hex colors for map track segments (E→R / 1→5). */
export const PACE_ZONE_HEX = [
  "#3B82F6", // blue-500 轻松
  "#22D3EE", // cyan-400 马拉松
  "#22C55E", // green-500 节奏
  "#FB923C", // orange-400 间歇
  "#EF4444", // red-500 耐力
] as const;

/** Chart background band colors matching HR zones 1–5. */
export const HR_ZONE_BAND_FILL = [
  "#BBDEFB",
  "#B2EBF2",
  "#C8E6C9",
  "#FFE0B2",
  "#FFCDD2",
] as const;

const DEFAULT_ZONE_FILL = [
  "bg-indigo-100",
  "bg-indigo-200",
  "bg-primary/40",
  "bg-primary/70",
  "bg-primary",
] as const;

function formatStay(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function WorkoutZoneBar({
  title,
  zones,
  zoneName,
  formatRange,
  formatValueRange,
  palette = "default",
  defaultOpen = false,
  showEmpty = false,
}: WorkoutZoneBarProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  if ((!zones || zones.length === 0) && !showEmpty) return null;

  const rows = zones ?? [];
  const hasShare = rows.some((zone) => zone.seconds > 0 || zone.ratio > 0);
  const fills =
    palette === "hr" || palette === "pace" ? PACE_ZONE_BAR_FILL : DEFAULT_ZONE_FILL;
  const showValue = Boolean(formatValueRange);
  const rowClass = showValue
    ? "grid grid-cols-[4.5rem_4.75rem_5.5rem_4.75rem_3rem] items-center gap-x-md text-left"
    : "grid grid-cols-[4.5rem_minmax(0,1fr)_4.75rem_3rem] items-center gap-x-md text-left";

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h3 className="text-small font-medium text-text-primary">{title}</h3>
        {rows.length > 0 ? (
          <button
            type="button"
            className="text-caption text-primary hover:underline"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? "收起" : "展开"}
          </button>
        ) : null}
      </div>
      <div className="mt-sm rounded-xl border border-border-subtle bg-white p-md">
        {rows.length === 0 ? (
          <p className="text-small text-text-secondary">暂无数据</p>
        ) : (
          <>
            {hasShare ? (
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-container-low" aria-hidden>
                {rows.map((zone, index) =>
                  zone.seconds > 0 || zone.ratio > 0 ? (
                    <span
                      key={`${zone.zone}-${index}`}
                      className={`h-full ${fills[index % fills.length]}`}
                      style={{ width: `${Math.max(zone.ratio * 100, 0)}%` }}
                      title={`${zoneName(zone.zone)} ${formatRatio(zone.ratio)}`}
                    />
                  ) : null,
                )}
              </div>
            ) : null}
            <div id={panelId} hidden={!open}>
              <ul className="mt-md grid gap-y-2">
                {rows.map((zone, index) => (
                  <li key={`${zone.zone}-${index}`} className={rowClass}>
                    <span className="inline-flex items-center gap-1.5 text-small text-text-primary">
                      <span
                        className={`size-2 shrink-0 rounded-full ${fills[index % fills.length]}`}
                        aria-hidden
                      />
                      {zoneName(zone.zone)}
                    </span>
                    <span className="text-caption tabular-nums text-text-secondary">
                      {formatRange(zone.lo, zone.hi)}
                    </span>
                    {showValue && formatValueRange ? (
                      <span className="text-caption tabular-nums text-text-secondary">
                        {formatValueRange(zone.lo, zone.hi)}
                      </span>
                    ) : null}
                    <span className="text-caption tabular-nums text-text-secondary">
                      {formatStay(zone.seconds)}
                    </span>
                    <span className="text-caption tabular-nums text-text-secondary">
                      {formatRatio(zone.ratio)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const PACE_ZONE_NAMES: Record<string, string> = {
  E: "轻松",
  M: "马拉松",
  T: "节奏",
  I: "间歇",
  R: "耐力",
};

export function paceZoneName(zone: ZoneShare["zone"]): string {
  const key = String(zone);
  return PACE_ZONE_NAMES[key] ?? `区间 ${key}`;
}

export function hrZoneName(zone: ZoneShare["zone"]): string {
  return `${zone} 区`;
}

export function formatPaceZoneRange(lo: number, hi: number): string {
  return `${formatPace(lo)}–${formatPace(hi)}`;
}

export function formatHrZoneRange(lo: number, hi: number): string {
  return `${Math.round(lo * 100)}%–${Math.round(hi * 100)}%`;
}

/** Convert intensity fraction (lo/hi on zone) to bpm using the same scale as backend zones. */
export function hrZoneBpm(
  frac: number,
  hrMax: number,
  hrRest: number | null | undefined,
): number {
  if (hrRest != null && hrMax > hrRest) {
    return Math.round(hrRest + frac * (hrMax - hrRest));
  }
  return Math.round(frac * hrMax);
}

export function formatHrZoneBpmRange(
  lo: number,
  hi: number,
  hrMax: number,
  hrRest: number | null | undefined,
): string {
  const a = hrZoneBpm(lo, hrMax, hrRest);
  const b = hrZoneBpm(hi, hrMax, hrRest);
  return `${a}–${b}`;
}

/** Horizontal bpm bands for the HR chart background (zones 1–5). */
export function hrZoneChartBands(
  hrMax: number | null | undefined,
  hrRest: number | null | undefined,
): Array<{ y0: number; y1: number; fill: string }> {
  if (hrMax == null || hrMax <= 0) return [];
  const bounds =
    hrRest != null && hrMax > hrRest
      ? [
          [0, 0.5],
          [0.5, 0.65],
          [0.65, 0.8],
          [0.8, 0.9],
          [0.9, 1],
        ]
      : [
          [0, 0.6],
          [0.6, 0.7],
          [0.7, 0.8],
          [0.8, 0.9],
          [0.9, 1],
        ];
  return bounds.map(([lo, hi], index) => ({
    y0: hrZoneBpm(lo, hrMax, hrRest),
    y1: hrZoneBpm(hi, hrMax, hrRest),
    fill: HR_ZONE_BAND_FILL[index] ?? HR_ZONE_BAND_FILL[4],
  }));
}

function formatPace(secPerKm: number): string {
  const total = Math.max(0, Math.round(secPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}'${String(seconds).padStart(2, "0")}"`;
}
