"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageMain } from "@/components/layout";
import { HealthMiniCalendar } from "@/components/health/HealthMiniCalendar";
import { HealthRangePicker } from "@/components/health/HealthRangePicker";
import { HealthSourcePicker, HEALTH_SOURCE_APPLE } from "@/components/health/HealthSourcePicker";
import { MyHealthCards } from "@/components/health/MyHealthCards";
import { MyHealthInsight } from "@/components/health/MyHealthInsight";
import { MyHealthWorkouts } from "@/components/health/MyHealthWorkouts";
import { fetchMyHealth, patchHealthLayout } from "@/lib/api/health-views";
import { getToken } from "@/lib/auth";
import type { MyHealthView } from "@/types/api/views/health";

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function hasHealthData(view: MyHealthView | null): boolean {
  if (!view) return false;
  if ((view.calendar_days ?? []).some((day) => day.has_metrics || day.has_workout || day.has_insight)) {
    return true;
  }
  const currentValues = Object.values(view.current ?? {});
  if (currentValues.some((value) => value != null)) return true;
  if ((view.recent_workouts?.length ?? 0) > 0) return true;
  if (view.workout_has_more) return true;
  return Object.values(view.series ?? {}).some((points) => points.some((point) => point.value != null));
}

export default function MyHealthPage() {
  const router = useRouter();
  const token = useMemo(() => getToken(), []);
  const [view, setView] = useState<MyHealthView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(todayIso());
  const [rangeDays, setRangeDays] = useState<number | null>(null);
  const [source, setSource] = useState(HEALTH_SOURCE_APPLE);
  const [month, setMonth] = useState(monthOf(todayIso()));

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setError(null);
    fetchMyHealth(token, {
      date: rangeDays ? undefined : selectedDate ?? undefined,
      range: rangeDays ?? undefined,
      month,
    })
      .then((next) => setView(next))
      .catch((e: { message?: string }) => setError(e?.message ?? "加载失败"))
      .finally(() => setLoading(false));
  }, [month, rangeDays, router, selectedDate, token]);

  const empty = !loading && !error && !hasHealthData(view);
  const rangeMode = rangeDays != null;

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="space-y-3xl">
        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}

        {empty ? (
          <section className="rounded-xl border border-border-subtle bg-white p-lg">
            <p className="text-small text-text-primary">还没有健康数据。</p>
            <p className="mt-2 text-small text-text-secondary">
              请在 iPhone 上打开 Timia → 我的 → 健康与健身，授权并同步。网页不会申请健康权限。
            </p>
          </section>
        ) : (
          <>
            <div className="grid items-start gap-lg lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="space-y-lg self-start lg:sticky lg:top-lg">
                <HealthMiniCalendar
                  month={view?.month ?? month}
                  selectedDate={rangeMode ? null : (view?.selected_date ?? selectedDate)}
                  days={view?.calendar_days ?? []}
                  today={todayIso()}
                  onMonthChange={setMonth}
                  onSelectDate={(next) => {
                    setRangeDays(null);
                    setSelectedDate(next);
                    setMonth(monthOf(next));
                  }}
                />
                <HealthRangePicker
                  value={rangeDays}
                  onChange={(days) => {
                    setRangeDays(days);
                    setSelectedDate(null);
                  }}
                />
                <HealthSourcePicker value={source} onChange={setSource} />
              </aside>
              <div className="min-w-0 space-y-lg">
                <MyHealthCards
                  current={view?.current}
                  totals={view?.totals}
                  scores={view?.scores}
                  scoreFormulas={view?.score_formulas}
                  cardOrder={view?.card_order}
                  series={view?.series ?? {}}
                  loading={loading}
                  rangeMode={rangeMode}
                  onReorder={(cardOrder) => {
                    if (!token) return;
                    setView((prev) => (prev ? { ...prev, card_order: cardOrder } : prev));
                    patchHealthLayout(token, cardOrder).catch((e: { message?: string }) => {
                      setError(e?.message ?? "保存卡片顺序失败");
                    });
                  }}
                />
                <MyHealthInsight
                  insight={view?.insight ?? null}
                  insights={view?.insights ?? []}
                  rangeMode={rangeMode}
                  loading={loading}
                />
                <MyHealthWorkouts
                  token={token}
                  ready={view != null}
                  initialWorkouts={view?.recent_workouts ?? []}
                  initialHasMore={view?.workout_has_more ?? false}
                  initialEndDate={view?.workout_end_date ?? null}
                  timezone={view?.timezone}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </PageMain>
  );
}
