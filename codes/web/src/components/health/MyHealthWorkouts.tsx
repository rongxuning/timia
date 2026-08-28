"use client";

import { useEffect, useRef } from "react";
import type { HealthWorkout } from "@/types/api/views/health";
import { workoutActivityStyle } from "@/components/health/workoutActivity";
import { useHealthWorkouts } from "@/hooks/useHealthWorkouts";

function durationLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
}

function localDateKey(iso: string, timeZone: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatYmd(key: string): string {
  const [year, month, day] = key.split("-");
  if (!year || !month || !day) return key;
  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

function paceLabel(secPerKm: number): string {
  const total = Math.max(0, Math.round(secPerKm));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}'${String(seconds).padStart(2, "0")}"/km`;
}

function locationLabel(workout: HealthWorkout): string | null {
  const parts = [workout.location_country, workout.location_admin, workout.location_city].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

function daySummary(items: HealthWorkout[]) {
  const durationSeconds = items.reduce((sum, item) => sum + item.duration_seconds, 0);
  const kcal = items.reduce((sum, item) => sum + (item.active_energy_kcal ?? 0), 0);
  const km = items.reduce((sum, item) => sum + (item.distance_m ?? 0), 0) / 1000;
  return {
    duration: durationLabel(durationSeconds),
    kcal: `${Math.round(kcal)} kcal`,
    distance: `${km <= 0 ? "0" : km < 10 ? km.toFixed(2) : km.toFixed(1)} km`,
  };
}

function groupByLocalDate(workouts: HealthWorkout[], timeZone: string) {
  const groups = new Map<string, HealthWorkout[]>();
  const sorted = [...workouts].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );
  for (const workout of sorted) {
    const key = localDateKey(workout.start_at, timeZone);
    const list = groups.get(key);
    if (list) list.push(workout);
    else groups.set(key, [workout]);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

type MyHealthWorkoutsProps = {
  token: string | null;
  ready?: boolean;
  initialWorkouts: HealthWorkout[];
  initialHasMore?: boolean;
  initialEndDate?: string | null;
  timezone?: string;
};

export function MyHealthWorkouts({
  token,
  ready = false,
  initialWorkouts,
  initialHasMore = false,
  initialEndDate = null,
  timezone = "Asia/Shanghai",
}: MyHealthWorkoutsProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { workouts, hasMore, hasBuffer, prefetching, seeded, consumeBuffer } = useHealthWorkouts({
    token,
    ready,
    initialWorkouts,
    initialHasMore,
    initialEndDate,
  });
  const consumeRef = useRef(consumeBuffer);
  consumeRef.current = consumeBuffer;

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) consumeRef.current();
      },
      { rootMargin: "640px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, hasBuffer, workouts.length]);

  const groups = groupByLocalDate(workouts, timezone);
  const showInitialLoading = !ready || !seeded;
  const showEmpty = ready && seeded && workouts.length === 0 && !hasMore && !prefetching;

  return (
    <section className="rounded-xl border border-border-subtle bg-white p-lg">
      <h2 className="font-headline text-lg font-bold text-text-primary">近期训练</h2>
      <p className="mt-1 text-caption text-neutral-muted">默认最近 7 天，下滑加载更早记录</p>
      {showInitialLoading ? (
        <p className="mt-lg text-small text-text-secondary">加载中…</p>
      ) : showEmpty ? (
        <p className="mt-lg text-small text-text-secondary">最近没有训练记录</p>
      ) : (
        <div className="mt-lg space-y-lg">
          {groups.map(([dateKey, items]) => {
            const summary = daySummary(items);
            return (
              <div key={dateKey} className="flex items-start gap-lg">
                <div className="w-[8.5rem] shrink-0 pt-1">
                  <p className="text-small font-medium text-text-primary">{formatYmd(dateKey)}</p>
                  <p className="mt-2 text-caption text-text-secondary">总锻炼 {summary.duration}</p>
                  <p className="text-caption text-text-secondary">总消耗 {summary.kcal}</p>
                  <p className="text-caption text-text-secondary">总距离 {summary.distance}</p>
                </div>
                <div className="flex min-w-0 flex-1 gap-md overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {items.map((workout) => {
                    const style = workoutActivityStyle(workout.activity_type, workout.activity_type_raw);
                    const place = locationLabel(workout);
                    const env = [
                      workout.weather_temp_c == null ? null : `${Math.round(workout.weather_temp_c)}℃`,
                      workout.weather_humidity == null
                        ? null
                        : `${Math.round(workout.weather_humidity * 100)}%`,
                      place,
                    ].filter(Boolean);
                    return (
                      <article
                        key={workout.id}
                        className="flex min-w-[280px] shrink-0 flex-col rounded-xl border border-border-subtle bg-white p-md"
                      >
                        <div className="flex items-start justify-between gap-md">
                          <div className="min-w-0">
                            <span
                              className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 ${style.bg} ${style.text}`}
                            >
                              <span className="material-symbols-outlined text-[16px] leading-none">
                                {style.icon}
                              </span>
                              <span className="truncate text-caption font-medium">{style.label}</span>
                            </span>
                            <p className="mt-md text-small text-text-primary">
                              {durationLabel(workout.duration_seconds)}
                            </p>
                          </div>
                          <dl className="shrink-0 space-y-1 text-right text-caption text-text-secondary">
                            <div>
                              耗能{" "}
                              {workout.active_energy_kcal == null
                                ? "—"
                                : `${Math.round(workout.active_energy_kcal)} kcal`}
                            </div>
                            {workout.avg_hr_bpm != null ? (
                              <div>平均心率 {Math.round(workout.avg_hr_bpm)} bpm</div>
                            ) : null}
                            {workout.avg_cadence_spm != null ? (
                              <div>平均步频 {Math.round(workout.avg_cadence_spm)} 步/分</div>
                            ) : null}
                            {workout.avg_pace_sec_per_km != null ? (
                              <div>平均配速 {paceLabel(workout.avg_pace_sec_per_km)}</div>
                            ) : null}
                          </dl>
                        </div>
                        {env.length > 0 ? (
                          <p className="mt-md self-end text-caption text-neutral-muted">{env.join("  ")}</p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {hasMore ? (
            <div ref={sentinelRef} className="py-sm">
              {workouts.length === 0 || prefetching ? (
                <p className="text-small text-text-secondary">加载中…</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
