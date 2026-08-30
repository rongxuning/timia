"use client";

import { useId, useState } from "react";
import type { HealthWorkoutDetail } from "@/types/api/views/health";

type ZoneShare = NonNullable<HealthWorkoutDetail["heart_rate_zones"]>[number];

type WorkoutZoneBarProps = {
  title: string;
  zones: ZoneShare[] | null | undefined;
  zoneName: (zone: ZoneShare["zone"]) => string;
  formatRange: (lo: number, hi: number) => string;
};

const ZONE_FILL = [
  "bg-indigo-100",
  "bg-indigo-200",
  "bg-primary/40",
  "bg-primary/70",
  "bg-primary",
];

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

export function WorkoutZoneBar({ title, zones, zoneName, formatRange }: WorkoutZoneBarProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!zones || zones.length === 0) return null;

  const hasShare = zones.some((zone) => zone.seconds > 0 || zone.ratio > 0);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h3 className="text-small font-medium text-text-primary">{title}</h3>
        <button
          type="button"
          className="text-caption text-primary hover:underline"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((prev) => !prev)}
        >
          {open ? "收起" : "展开"}
        </button>
      </div>
      <div className="mt-sm rounded-xl border border-border-subtle bg-white p-md">
        {hasShare ? (
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-container-low" aria-hidden>
            {zones.map((zone, index) =>
              zone.seconds > 0 || zone.ratio > 0 ? (
                <span
                  key={`${zone.zone}-${index}`}
                  className={`h-full ${ZONE_FILL[index % ZONE_FILL.length]}`}
                  style={{ width: `${Math.max(zone.ratio * 100, 0)}%` }}
                  title={`${zoneName(zone.zone)} ${formatRatio(zone.ratio)}`}
                />
              ) : null,
            )}
          </div>
        ) : null}
        <div id={panelId} hidden={!open}>
          <ul className="mt-md divide-y divide-border-subtle/80">
            {zones.map((zone, index) => (
              <li
                key={`${zone.zone}-${index}`}
                className="flex flex-wrap items-baseline justify-between gap-x-md gap-y-1 py-2 first:pt-0 last:pb-0"
              >
                <span className="text-small text-text-primary">{zoneName(zone.zone)}</span>
                <span className="text-caption tabular-nums text-text-secondary">
                  {formatRange(zone.lo, zone.hi)}
                  <span className="mx-1.5 text-neutral-muted">·</span>
                  {formatStay(zone.seconds)}
                  <span className="mx-1.5 text-neutral-muted">·</span>
                  {formatRatio(zone.ratio)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const PACE_ZONE_NAMES: Record<string, string> = {
  E: "轻松",
  M: "马拉松",
  T: "节奏",
  I: "间歇",
  R: "重复",
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

function formatPace(secPerKm: number): string {
  const total = Math.max(0, Math.round(secPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}'${String(seconds).padStart(2, "0")}"`;
}
