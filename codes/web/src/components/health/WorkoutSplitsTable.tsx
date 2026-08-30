"use client";

import { resolveAvgPaceSecPerKm } from "@/components/health/workoutPace";
import type { HealthWorkoutDetail } from "@/types/api/views/health";

type WorkoutSplitsTableProps = {
  splits: HealthWorkoutDetail["splits"];
};

function formatLapTime(seconds: number, isTotal: boolean): string {
  const total = Math.max(0, Math.round(seconds));
  if (isTotal) {
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function paceLabel(secPerKm: number | null | undefined): string {
  if (secPerKm == null) return "—";
  const total = Math.max(0, Math.round(secPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}'${String(seconds).padStart(2, "0")}"`;
}

function dashInt(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(Math.round(value));
}

export function WorkoutSplitsTable({ splits }: WorkoutSplitsTableProps) {
  if (!splits || splits.length === 0) return null;

  return (
    <section>
      <h3 className="text-small font-medium text-text-primary">分段信息</h3>
      <div className="mt-sm overflow-x-auto rounded-xl border border-border-subtle bg-white">
        <table className="min-w-full text-left text-small" aria-label="分段信息">
          <thead>
            <tr className="border-b border-border-subtle bg-indigo-50/40 text-caption text-neutral-muted">
              <th className="whitespace-nowrap px-3 py-2 font-medium">圈数</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">时间</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">距离（公里）</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">平均配速</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">平均心率</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">平均步频</th>
            </tr>
          </thead>
          <tbody>
            {splits.map((split, index) => {
              const pace = resolveAvgPaceSecPerKm({
                avg_pace_sec_per_km: split.pace_sec_per_km,
                distance_m: split.distance_m,
                duration_seconds: split.duration_seconds,
              });
              return (
                <tr
                  key={split.is_total ? "total" : `${split.lap}-${index}`}
                  className={`border-b border-border-subtle/80 last:border-b-0 ${
                    split.is_total ? "bg-indigo-50/30 font-medium" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-text-primary">
                    {split.is_total ? "总计" : split.lap}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-text-primary">
                    {formatLapTime(split.duration_seconds, split.is_total)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-text-primary">
                    {(split.distance_m / 1000).toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-text-primary">
                    {paceLabel(pace)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-text-primary">
                    {dashInt(split.avg_hr_bpm)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-text-primary">
                    {dashInt(split.avg_cadence_spm)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
