"use client";

import type { HealthWorkout } from "@/types/api/views/health";
import { workoutActivityStyle } from "@/components/health/workoutActivity";

function durationLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

type HealthWorkoutMiniListProps = {
  workouts: HealthWorkout[];
  empty?: string;
};

export function HealthWorkoutMiniList({ workouts, empty }: HealthWorkoutMiniListProps) {
  if (workouts.length === 0) {
    return <p className="mt-sm text-caption text-neutral-muted">{empty ?? "当天没有相关训练。"}</p>;
  }
  return (
    <ul className="mt-sm space-y-sm">
      {workouts.map((workout) => {
        const style = workoutActivityStyle(workout.activity_type, workout.activity_type_raw);
        return (
          <li
            key={workout.id}
            className="flex items-center justify-between gap-sm rounded-xl border border-border-subtle px-md py-sm"
          >
            <div className="min-w-0">
              <p className={`inline-flex rounded-lg px-2 py-0.5 text-caption font-medium ${style.bg} ${style.text}`}>
                {style.label}
              </p>
              <p className="mt-1 text-caption text-text-secondary">
                {clock(workout.start_at)} · {durationLabel(workout.duration_seconds)}
              </p>
            </div>
            <p className="shrink-0 text-caption tabular-nums text-text-secondary">
              {workout.active_energy_kcal != null ? `${Math.round(workout.active_energy_kcal)} kcal` : ""}
              {workout.avg_hr_bpm != null ? ` · ${Math.round(workout.avg_hr_bpm)} bpm` : ""}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
