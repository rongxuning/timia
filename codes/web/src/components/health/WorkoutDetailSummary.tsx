"use client";

import { workoutActivityStyle } from "@/components/health/workoutActivity";
import { WorkoutSplitsTable } from "@/components/health/WorkoutSplitsTable";
import { resolveAvgPaceSecPerKm } from "@/components/health/workoutPace";
import type { HealthWorkoutDetail } from "@/types/api/views/health";

const WEEKDAY: Record<string, string> = {
  Sun: "日",
  Mon: "一",
  Tue: "二",
  Wed: "三",
  Thu: "四",
  Fri: "五",
  Sat: "六",
};

function formatWorkoutDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = WEEKDAY[get("weekday")] ?? get("weekday");
  return `${get("year")}年${Number(get("month"))}月${Number(get("day"))}日 星期${weekday} ${get("hour")}:${get("minute")}`;
}

function durationHms(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function paceLabel(secPerKm: number | null | undefined): string {
  if (secPerKm == null) return "—";
  const total = Math.max(0, Math.round(secPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}'${String(seconds).padStart(2, "0")}"`;
}

function dashNumber(
  value: number | null | undefined,
  format: (n: number) => string,
): string {
  if (value == null) return "—";
  return format(value);
}

function locationLabel(workout: HealthWorkoutDetail): string | null {
  const parts = [workout.location_country, workout.location_admin, workout.location_city].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

function weatherLabel(workout: HealthWorkoutDetail): string | null {
  const parts = [
    workout.weather_temp_c == null ? null : `${Math.round(workout.weather_temp_c)}℃`,
    workout.weather_humidity == null ? null : `${Math.round(workout.weather_humidity * 100)}%`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

function FormulaHelp({ formula, hint }: { formula: string; hint: string }) {
  return (
    <span className="group/help relative z-10 inline-flex hover:z-30">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[0.68em] leading-none text-neutral-muted hover:bg-gray-50 hover:text-text-secondary"
        aria-label="指标说明"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="absolute left-0 top-full z-20 hidden w-72 max-w-[min(18rem,calc(100vw-2rem))] pt-1 group-hover/help:block group-focus-within/help:block"
      >
        <span className="block rounded-xl border border-border-subtle bg-white px-md py-sm text-caption leading-5 text-text-secondary shadow-lg">
          <span className="block">{hint}</span>
          <span className="mt-1 block">公式：{formula}</span>
        </span>
      </span>
    </span>
  );
}

function MetricCell({
  label,
  value,
  sub,
  help,
}: {
  label: string;
  value: string;
  sub?: string | null;
  help?: { formula: string; hint: string } | null;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-white p-md">
      <div className="flex items-center gap-1">
        <p className="text-overline text-zinc-400">{label}</p>
        {help ? <FormulaHelp formula={help.formula} hint={help.hint} /> : null}
      </div>
      <p className="mt-sm font-headline text-lg font-bold tabular-nums leading-tight text-text-primary">{value}</p>
      {sub ? <p className="mt-1 text-caption text-text-secondary">{sub}</p> : null}
    </div>
  );
}

type WorkoutDetailSummaryProps = {
  workout: HealthWorkoutDetail;
  timezone?: string;
};

export function WorkoutDetailSummary({
  workout,
  timezone = "Asia/Shanghai",
}: WorkoutDetailSummaryProps) {
  const style = workoutActivityStyle(workout.activity_type, workout.activity_type_raw);
  const weather = weatherLabel(workout);
  const place = locationLabel(workout);
  const watt =
    workout.running_power_w == null ? null : `约 ${Math.round(workout.running_power_w)} 瓦`;
  const loadExtras = [
    workout.trimp == null ? null : `TRIMP ${workout.trimp.toFixed(1)}`,
    workout.rtss == null ? null : `rTSS ${workout.rtss.toFixed(1)}`,
  ].filter(Boolean);

  return (
    <section className="space-y-lg">
      <div className="flex flex-wrap items-center gap-x-md gap-y-sm">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${style.bg} ${style.text}`}>
          <span className="material-symbols-outlined text-[16px] leading-none">{style.icon}</span>
          <span className="text-caption font-medium">{style.label}</span>
        </span>
        <p className="text-small text-text-secondary">{formatWorkoutDateTime(workout.start_at, timezone)}</p>
        {weather ? <p className="text-small text-text-secondary">{weather}</p> : null}
        {place ? <p className="text-small text-text-secondary">{place}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-md sm:grid-cols-3">
        <MetricCell
          label="即时跑力"
          value={dashNumber(workout.running_index, (n) => n.toFixed(1))}
          sub={watt}
          help={workout.running_index_formula}
        />
        <MetricCell
          label="距离（公里）"
          value={dashNumber(workout.distance_m, (n) => (n / 1000).toFixed(2))}
        />
        <MetricCell
          label="平均配速"
          value={paceLabel(
            resolveAvgPaceSecPerKm({
              avg_pace_sec_per_km: workout.avg_pace_sec_per_km,
              distance_m: workout.distance_m,
              duration_seconds: workout.duration_seconds,
            }),
          )}
        />
        <MetricCell
          label="训练负荷"
          value={dashNumber(workout.training_load, (n) => n.toFixed(1))}
          help={workout.training_load_formula}
        />
        <MetricCell label="总时长" value={durationHms(workout.duration_seconds)} />
        <MetricCell
          label="平均心率（次/分）"
          value={dashNumber(workout.avg_hr_bpm, (n) => String(Math.round(n)))}
        />
        <MetricCell
          label="累计爬升（米）"
          value={dashNumber(workout.elevation_ascended_m, (n) => String(Math.round(n)))}
        />
        <MetricCell
          label="平均步幅（米）"
          value={dashNumber(workout.stride_m, (n) => n.toFixed(2))}
        />
        <MetricCell
          label="平均步频（步/分）"
          value={dashNumber(workout.avg_cadence_spm, (n) => String(Math.round(n)))}
        />
      </div>
      {loadExtras.length > 0 ? (
        <p className="text-caption text-text-secondary">{loadExtras.join(" · ")}</p>
      ) : null}
      <WorkoutSplitsTable splits={workout.splits} />
      <div className="rounded-xl border border-dashed border-border-subtle p-lg">
        <h3 className="text-small font-medium text-text-primary">分析与建议</h3>
        <p className="mt-2 text-small text-text-secondary">
          将根据该次训练的原始数据生成观察与建议，稍后接入。
        </p>
      </div>
    </section>
  );
}
