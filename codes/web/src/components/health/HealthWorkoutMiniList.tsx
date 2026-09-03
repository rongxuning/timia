"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { workoutActivityStyle } from "@/components/health/workoutActivity";
import type { HealthWorkout } from "@/types/api/views/health";

function durationLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** 例：2026年08月26日 07:32 */
function dateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}年${get("month")}月${get("day")}日 ${get("hour")}:${get("minute")}`;
}

type HealthWorkoutMiniListProps = {
  workouts: HealthWorkout[];
  empty?: string;
  /** 开始时间是否带日期（VO2 估算日列表跨多天时需要） */
  showStartDate?: boolean;
};

export function HealthWorkoutMiniList({
  workouts,
  empty,
  showStartDate = false,
}: HealthWorkoutMiniListProps) {
  const search = useSearchParams();
  const query = search.toString();
  const suffix = query ? `?${query}` : "";

  if (workouts.length === 0) {
    return <p className="mt-sm text-caption text-neutral-muted">{empty ?? "当天没有相关训练。"}</p>;
  }
  return (
    <ul className="mt-sm space-y-sm">
      {workouts.map((workout) => {
        const style = workoutActivityStyle(workout.activity_type, workout.activity_type_raw);
        const parts = [
          showStartDate ? dateTime(workout.start_at) : clock(workout.start_at),
          durationLabel(workout.duration_seconds),
          workout.active_energy_kcal != null ? `${Math.round(workout.active_energy_kcal)} kcal` : "—",
          workout.avg_hr_bpm != null ? `${Math.round(workout.avg_hr_bpm)} bpm` : "—",
        ];
        return (
          <li key={workout.id}>
            <Link
              href={`/my/health/workouts/${workout.id}${suffix}`}
              aria-label={`${style.label}，查看训练详情`}
              className="flex items-center gap-sm rounded-xl border border-border-subtle px-md py-sm text-caption transition-shadow hover:bg-surface-container-lowest hover:shadow-md"
            >
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-sm gap-y-1 text-text-secondary">
                <span className={`inline-flex rounded-lg px-2 py-0.5 font-medium ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
                {parts.flatMap((part, index) => [
                  <span key={`s-${index}`} className="text-neutral-muted">
                    |
                  </span>,
                  <span key={`v-${index}`} className="tabular-nums">
                    {part}
                  </span>,
                ])}
              </span>
              <span className="material-symbols-outlined shrink-0 text-[18px] leading-none text-neutral-muted" aria-hidden>
                chevron_right
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
