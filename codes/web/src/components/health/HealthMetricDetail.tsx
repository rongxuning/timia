"use client";

import type { ReactNode } from "react";
import { HealthChartFrame, HealthEmptyHint, HealthSleepStatGrid, HealthStatGrid } from "@/components/health/HealthChartFrame";
import { HealthHeartbeatBars } from "@/components/health/HealthHeartbeatBars";
import { HealthHourlyBars } from "@/components/health/HealthHourlyBars";
import { HealthScatterChart } from "@/components/health/HealthScatterChart";
import { HealthSleepHypnogram, HealthSleepStageAverage } from "@/components/health/HealthSleepHypnogram";
import { HealthStandGrid } from "@/components/health/HealthStandGrid";
import { HealthWorkoutMiniList } from "@/components/health/HealthWorkoutMiniList";
import type { HealthCardKey } from "@/components/health/healthCards";
import { SCORE_BAND_ROW_CLASS, scoreSleepMinutes, toneForScore } from "@/components/health/healthScoreBands";
import type { HealthCardDetail, HealthEnergyTargets } from "@/types/api/views/health";

type HealthSleepNight = NonNullable<HealthCardDetail["sleep_nights"]>[number] & {
  score?: number | null;
};

type HealthMetricDetailProps = {
  metric: HealthCardKey;
  detail: HealthCardDetail | null;
  loading?: boolean;
  energyTargets?: HealthEnergyTargets | null;
  rangeMode?: boolean;
  rangeDays?: number | null;
};

export function HealthMetricDetail({
  metric,
  detail,
  loading,
  energyTargets,
  rangeMode,
  rangeDays,
}: HealthMetricDetailProps) {
  if (loading && !detail) {
    return <p className="mt-lg text-small text-text-secondary">加载详情…</p>;
  }
  if (!detail) {
    return <HealthEmptyHint text="暂时无法加载该指标的详情。" />;
  }
  switch (metric) {
    case "steps":
      return <StepsDetail detail={detail} />;
    case "active":
      return <ActiveDetail detail={detail} />;
    case "basal":
      return <BasalDetail detail={detail} energyTargets={energyTargets} />;
    case "exercise":
      return <ExerciseDetail detail={detail} />;
    case "stand":
      return <StandDetail detail={detail} />;
    case "rhr":
      return <RhrDetail detail={detail} />;
    case "sleep":
      return <SleepDetail detail={detail} rangeMode={rangeMode} rangeDays={rangeDays} />;
    case "weight":
      return <WeightDetail detail={detail} />;
    case "hrv":
      return <HrvDetail detail={detail} />;
    case "vo2":
      return <Vo2Detail detail={detail} />;
    case "recovery":
      return <RecoveryDetail detail={detail} />;
    case "spo2":
      return <Spo2Detail detail={detail} />;
    default:
      return null;
  }
}

function StepsDetail({ detail }: { detail: HealthCardDetail }) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "步行跑步距离", value: meters(detail.stats?.distance_m) },
          { label: "爬楼", value: count(detail.stats?.flights_climbed, "层") },
        ]}
      />
      <HealthChartFrame title="当日步数分布" hint="按小时把原始步数段加总，不是日表再切分。">
        <HealthHourlyBars points={detail.hourly ?? []} format={(value) => String(Math.round(value))} />
      </HealthChartFrame>
      <HealthChartFrame title="步行 / 跑步 / 徒步">
        <HealthWorkoutMiniList workouts={detail.workouts ?? []} empty="当天没有步行、跑步或徒步训练。" />
      </HealthChartFrame>
    </>
  );
}

function ActiveDetail({ detail }: { detail: HealthCardDetail }) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "活动消耗", value: kcal(detail.stats?.active_energy_kcal) },
          { label: "训练消耗（近似）", value: kcal(detail.stats?.workout_energy_kcal) },
          { label: "日常活动（近似）", value: kcal(detail.stats?.neat_energy_kcal) },
          { label: "活动目标", value: kcal(detail.stats?.active_target_kcal) },
          { label: "步数", value: count(detail.stats?.steps, "步") },
          { label: "锻炼分钟", value: count(detail.stats?.exercise_minutes, "分钟") },
        ]}
      />
      <p className="mt-sm text-caption text-neutral-muted">
        训练消耗来自训练摘要，与全天活动热量可能部分重叠，拆分只作观察。
      </p>
      <HealthChartFrame title="当日活动消耗" hint="按小时汇总 active energy。色带为当天训练时段。">
        <HealthHourlyBars
          points={detail.hourly ?? []}
          format={(value) => `${Math.round(value)}`}
          workouts={detail.workouts ?? []}
          timezone={detail.timezone}
        />
      </HealthChartFrame>
      <HealthChartFrame title="当天训练">
        <HealthWorkoutMiniList workouts={detail.workouts ?? []} />
      </HealthChartFrame>
    </>
  );
}

function BasalDetail({
  detail,
  energyTargets,
}: {
  detail: HealthCardDetail;
  energyTargets?: HealthEnergyTargets | null;
}) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "手表静态消耗", value: kcal(detail.stats?.basal_energy_kcal) },
          { label: "活动消耗", value: kcal(detail.stats?.active_energy_kcal) },
          { label: "总消耗（近似）", value: kcal(detail.stats?.total_energy_kcal) },
          { label: "推算基础代谢", value: kcal(detail.stats?.bmr_kcal ?? energyTargets?.bmr_kcal) },
        ]}
      />
      <p className="mt-sm text-caption text-neutral-muted">
        手表静态消耗是估算值。有完整基础信息与体重时，才会用 Mifflin-St Jeor 推算对照目标。
      </p>
      <HealthChartFrame title="当日静态消耗" hint="通常较平滑，用来看戴表估算是否连续。">
        <HealthHourlyBars points={detail.hourly ?? []} format={(value) => `${Math.round(value)}`} />
      </HealthChartFrame>
    </>
  );
}

function ExerciseDetail({ detail }: { detail: HealthCardDetail }) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "锻炼分钟（圆环）", value: count(detail.stats?.exercise_minutes, "分钟") },
          { label: "训练会话时长", value: count(detail.stats?.workout_minutes, "分钟") },
        ]}
      />
      <p className="mt-sm text-caption text-neutral-muted">
        锻炼分钟是 Apple 活动圆环，达到一定强度才计；不等于训练会话时长。
      </p>
      <HealthChartFrame title="当日锻炼分钟分布">
        <HealthHourlyBars points={detail.hourly ?? []} format={(value) => `${Math.round(value)}`} />
      </HealthChartFrame>
      <HealthChartFrame title="当天训练">
        <HealthWorkoutMiniList workouts={detail.workouts ?? []} />
      </HealthChartFrame>
    </>
  );
}

function StandDetail({ detail }: { detail: HealthCardDetail }) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "站立小时", value: count(detail.stats?.stand_hours, "小时") },
          { label: "站立分钟", value: count(detail.stats?.stand_minutes, "分钟") },
          { label: "最长久坐块", value: count(detail.stats?.sit_streak_max, "小时") },
        ]}
      />
      <p className="mt-sm text-caption text-neutral-muted">
        站立小时按「这一小时有没有达到已站立」计数，站一分钟也可能算一小时；请同时看站立分钟。
      </p>
      <HealthChartFrame title="24 小时站立" hint="色块为已站立，琥珀色为白天连续未站立。">
        <HealthStandGrid cells={detail.stand_cells ?? []} sitStreaks={detail.sit_streaks ?? []} />
      </HealthChartFrame>
      <HealthChartFrame title="站立分钟分布">
        <HealthHourlyBars points={detail.hourly ?? []} format={(value) => `${Math.round(value)}`} />
      </HealthChartFrame>
    </>
  );
}

function RhrDetail({ detail }: { detail: HealthCardDetail }) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "静息心率", value: bpm(detail.stats?.resting_hr_bpm) },
          { label: "心率最低", value: bpm(detail.stats?.hr_min) },
          { label: "心率平均", value: bpm(detail.stats?.hr_avg) },
          { label: "心率最高", value: bpm(detail.stats?.hr_max) },
          { label: "心率样本", value: count(detail.stats?.hr_count, "条") },
        ]}
      />
      <HealthChartFrame title="当日心率（按小时）" hint="原始点很多，这里按小时显示均线与高低范围。">
        <HealthHourlyBars
          points={detail.hourly_heart_rate ?? []}
          showBand
          format={(value) => `${Math.round(value)}`}
        />
      </HealthChartFrame>
      <HealthChartFrame title="静息心率样本">
        <HealthScatterChart points={detail.samples ?? []} format={(value) => `${Math.round(value)}`} />
      </HealthChartFrame>
    </>
  );
}

function SleepDetail({
  detail,
  rangeMode,
  rangeDays,
}: {
  detail: HealthCardDetail;
  rangeMode?: boolean;
  rangeDays?: number | null;
}) {
  const nights = [...(detail.sleep_nights ?? [])].sort((a, b) => b.local_date.localeCompare(a.local_date));
  const average = rangeMode ? averageSleepNight(nights) : null;
  const night = rangeMode ? average : detail.sleep;
  const structureHint = rangeMode
    ? `${rangeDays ?? nights.length} 日平均值。分期来自手表算法，不是多导睡眠图。`
    : "分期来自手表算法，不是多导睡眠图。";
  return (
    <>
      <HealthSleepStatGrid
        items={[
          { label: rangeMode ? "平均入睡" : "入睡", value: night?.bedtime ? clock(night.bedtime) : "—" },
          { label: rangeMode ? "平均起床" : "起床", value: night?.wake_at ? clock(night.wake_at) : "—" },
          { label: rangeMode ? "平均实睡" : "实睡", value: durationMinutes(night?.asleep_minutes) },
          { label: rangeMode ? "平均睡眠效率" : "睡眠效率", value: percent01(night?.efficiency) },
          { label: rangeMode ? "平均夜间清醒" : "夜间清醒", value: durationMinutes(night?.awake_minutes) },
          { label: rangeMode ? "平均 REM" : "REM", value: durationMinutes(night?.rem_minutes) },
          { label: rangeMode ? "平均核心" : "核心", value: durationMinutes(night?.core_minutes) },
          { label: rangeMode ? "平均深睡" : "深睡", value: durationMinutes(night?.deep_minutes) },
          { label: "就寝波动", value: count(detail.bedtime_std_minutes, "分钟") },
        ]}
      />
      <p className="mt-sm text-caption text-neutral-muted">{structureHint}</p>
      <HealthChartFrame title={rangeMode ? "平均睡眠结构" : "睡眠结构"}>
        {rangeMode ? (
          <HealthSleepStageAverage
            deepMinutes={night?.deep_minutes}
            coreMinutes={night?.core_minutes}
            remMinutes={night?.rem_minutes}
            awakeMinutes={night?.awake_minutes}
          />
        ) : (
          <HealthSleepHypnogram segments={detail.sleep?.segments ?? []} />
        )}
      </HealthChartFrame>
      {nights.length > 0 ? (
        <HealthChartFrame title="近期夜晚" aside={<SleepNightToneStats nights={nights} />}>
          <SleepNightsTable nights={nights} />
        </HealthChartFrame>
      ) : null}
    </>
  );
}

const NIGHT_GRID =
  "grid min-w-[52rem] grid-cols-[4.75rem_0.75rem_2.25rem_0.75rem_3.25rem_0.75rem_3.25rem_0.75rem_7.75rem_0.75rem_7.75rem_0.75rem_7.75rem_0.75rem_7.75rem_0.75rem_7.75rem] items-center";

function SleepNightToneStats({ nights }: { nights: HealthSleepNight[] }) {
  const counts = { high: 0, good: 0, mid: 0, low: 0 };
  for (const item of nights) {
    const score = item.score ?? scoreSleepMinutes(item.asleep_minutes);
    const tone = toneForScore(score);
    if (tone !== "none") counts[tone] += 1;
  }
  const total = counts.high + counts.good + counts.mid + counts.low;
  if (total === 0) return null;
  const items = [
    { key: "high" as const, label: "绿", count: counts.high },
    { key: "good" as const, label: "蓝", count: counts.good },
    { key: "mid" as const, label: "黄", count: counts.mid },
    { key: "low" as const, label: "红", count: counts.low },
  ];
  return (
    <p className="flex flex-wrap gap-x-sm gap-y-1 text-caption tabular-nums text-text-secondary">
      {items.map((item) => (
        <span key={item.key} className={`rounded-md px-sm py-0.5 ${SCORE_BAND_ROW_CLASS[item.key]}`}>
          {item.label}：{item.count}（{Math.round((item.count / total) * 100)}%）
        </span>
      ))}
    </p>
  );
}

function SleepNightsTable({ nights }: { nights: HealthSleepNight[] }) {
  const header = ["日期", "评分", "入睡", "起床", "睡眠时间", "夜间清醒", "REM", "核心", "深睡"];
  return (
    <div className="overflow-x-auto">
      <div className={`${NIGHT_GRID} px-sm py-1 text-caption text-neutral-muted`}>
        {joinCells(header, "text-neutral-muted")}
      </div>
      <ul>
        {nights.map((item) => {
          const score = item.score ?? scoreSleepMinutes(item.asleep_minutes);
          const tone = toneForScore(score);
          return (
            <li key={item.local_date} className={`${NIGHT_GRID} rounded-md px-sm py-1 text-caption tabular-nums ${SCORE_BAND_ROW_CLASS[tone]}`}>
              {joinCells([
                formatMonthDay(item.local_date),
                score == null ? "—" : String(score),
                clockCell(item.bedtime),
                clockCell(item.wake_at),
                durationCell(item.asleep_minutes),
                durationCell(item.awake_minutes),
                durationCell(item.rem_minutes),
                durationCell(item.core_minutes),
                durationCell(item.deep_minutes),
              ])}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function joinCells(cells: string[], valueClass = "text-text-secondary"): ReactNode {
  return cells.flatMap((cell, index) => {
    const value = (
      <span key={`v-${index}`} className={`whitespace-pre ${valueClass}`}>
        {cell}
      </span>
    );
    if (index === 0) return [value];
    return [
      <span key={`s-${index}`} className="text-center text-neutral-muted">
        |
      </span>,
      value,
    ];
  });
}

function averageSleepNight(nights: HealthSleepNight[]): HealthSleepNight | null {
  if (nights.length === 0) return null;
  const mean = (values: Array<number | null | undefined>) => {
    const nums = values.filter((value): value is number => value != null);
    if (nums.length === 0) return null;
    return nums.reduce((sum, value) => sum + value, 0) / nums.length;
  };
  return {
    local_date: nights[0].local_date,
    bedtime: averageClockIso(nights.map((item) => item.bedtime), true),
    wake_at: averageClockIso(nights.map((item) => item.wake_at), false),
    in_bed_minutes: mean(nights.map((item) => item.in_bed_minutes)),
    asleep_minutes: mean(nights.map((item) => item.asleep_minutes)),
    efficiency: mean(nights.map((item) => item.efficiency)),
    deep_minutes: mean(nights.map((item) => item.deep_minutes)),
    rem_minutes: mean(nights.map((item) => item.rem_minutes)),
    core_minutes: mean(nights.map((item) => item.core_minutes)),
    awake_minutes: mean(nights.map((item) => item.awake_minutes)),
    unspecified_minutes: mean(nights.map((item) => item.unspecified_minutes)),
    score: null,
    segments: [],
  };
}

function averageClockIso(values: Array<string | null | undefined>, wrapLateNight: boolean): string | null {
  const minutes: number[] = [];
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    let total = hour * 60 + minute;
    if (wrapLateNight && hour < 12) total += 24 * 60;
    minutes.push(total);
  }
  if (minutes.length === 0) return null;
  const mean = minutes.reduce((sum, value) => sum + value, 0) / minutes.length;
  const normalized = ((Math.round(mean) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const isoHour = String(hour).padStart(2, "0");
  const isoMinute = String(minute).padStart(2, "0");
  return `1970-01-01T${isoHour}:${isoMinute}:00+08:00`;
}

function formatMonthDay(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function clockCell(iso?: string | null): string {
  const value = clock(iso);
  return value === "—" ? "     —" : value;
}

function durationCell(value?: number | null): string {
  if (value == null) return "            —";
  let hours = Math.floor(value / 60);
  let rest = Math.round(value % 60);
  if (rest === 60) {
    hours += 1;
    rest = 0;
  }
  return `${String(hours).padStart(2, " ")} 小时 ${String(rest).padStart(2, " ")} 分钟`;
}

function WeightDetail({ detail }: { detail: HealthCardDetail }) {
  const slope = detail.stats?.weight_slope_kg_per_week;
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "最近体重", value: kg(detail.stats?.body_mass_kg) },
          { label: "斜率", value: slope == null ? "—" : `${slope >= 0 ? "+" : ""}${slope.toFixed(2)} kg/周` },
          { label: "称重点", value: count(detail.stats?.sample_count, "次") },
        ]}
      />
      <HealthChartFrame title="称重点" hint="每次称重，而不是日末值。不根据体重做因果判断。">
        <HealthScatterChart points={detail.samples ?? []} format={(value) => value.toFixed(1)} />
      </HealthChartFrame>
    </>
  );
}

function HrvDetail({ detail }: { detail: HealthCardDetail }) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "日中位数", value: ms(detail.stats?.hrv_median_ms) },
          { label: "当日样本", value: count(detail.stats?.sample_count, "条") },
          { label: "静息心率", value: bpm(detail.stats?.resting_hr_bpm) },
          { label: "昨夜实睡", value: durationMinutes(detail.stats?.sleep_asleep_minutes) },
        ]}
      />
      <HealthChartFrame title="当日 SDNN">
        <HealthScatterChart points={detail.samples ?? []} format={(value) => `${Math.round(value)}`} />
      </HealthChartFrame>
      <HealthChartFrame title="最近一段 RR 间隔" hint="tachogram 预览，最多展示一段。">
        <HealthHeartbeatBars intervalsMs={detail.heartbeat?.intervals_ms ?? []} />
      </HealthChartFrame>
    </>
  );
}

function Vo2Detail({ detail }: { detail: HealthCardDetail }) {
  const slope = detail.stats?.vo2_slope_per_week;
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "最近 VO2 Max", value: vo2(detail.stats?.vo2_max) },
          { label: "估算次数", value: count(detail.stats?.sample_count, "次") },
          { label: "斜率", value: slope == null ? "—" : `${slope >= 0 ? "+" : ""}${slope.toFixed(2)} /周` },
        ]}
      />
      <p className="mt-sm text-caption text-neutral-muted">手表在合格的户外走跑后才会估算，不是实验室测值。</p>
      <HealthChartFrame title="估算点">
        <HealthScatterChart points={detail.samples ?? []} format={(value) => value.toFixed(1)} />
      </HealthChartFrame>
      <HealthChartFrame title="估算日附近的户外有氧">
        <HealthWorkoutMiniList workouts={detail.workouts ?? []} empty="这些估算日附近没有步行、跑步或徒步。" />
      </HealthChartFrame>
    </>
  );
}

function RecoveryDetail({ detail }: { detail: HealthCardDetail }) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "最近有氧恢复", value: bpm(detail.stats?.cardio_recovery_bpm) },
          { label: "测量次数", value: count(detail.stats?.sample_count, "次") },
          { label: "可能过晚", value: count(detail.stats?.late_count, "次") },
        ]}
      />
      <p className="mt-sm text-caption text-neutral-muted">
        有氧恢复应在训练结束后很快测量；间隔过长时数值可能偏低，图上会标出。
      </p>
      <HealthChartFrame title="每次测量">
        <HealthScatterChart points={detail.samples ?? []} format={(value) => `${Math.round(value)}`} />
      </HealthChartFrame>
      <ul className="mt-md space-y-sm">
        {(detail.recovery_links ?? []).map((item) => (
          <li key={item.at} className="rounded-xl border border-border-subtle px-md py-sm text-caption">
            <p className="text-text-primary">
              {clock(item.at)} · {Math.round(item.value)} bpm
              {item.possibly_late ? " · 可能过晚" : ""}
            </p>
            <p className="mt-1 text-text-secondary">
              {item.workout
                ? `${clock(item.workout.end_at)} 结束 · 均心率 ${item.workout.avg_hr_bpm != null ? Math.round(item.workout.avg_hr_bpm) : "—"} · 最高 ${item.workout.max_hr_bpm != null ? Math.round(item.workout.max_hr_bpm) : "—"}`
                : "未匹配到邻近训练"}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

function Spo2Detail({ detail }: { detail: HealthCardDetail }) {
  return (
    <>
      <HealthStatGrid
        items={[
          { label: "平均", value: spo2(detail.stats?.spo2_avg) },
          { label: "最低", value: spo2(detail.stats?.spo2_min) },
          { label: "最高", value: spo2(detail.stats?.spo2_max) },
          { label: "夜间平均", value: spo2(detail.stats?.spo2_night_avg) },
          { label: "白天平均", value: spo2(detail.stats?.spo2_day_avg) },
          { label: "点测次数", value: count(detail.stats?.sample_count, "次") },
        ]}
      />
      <p className="mt-sm text-caption text-neutral-muted">
        血氧只适合看相对自己的波动，不能当作肺病或睡眠呼吸暂停的判断。夜间用 22:00–08:00 划分。
      </p>
      <HealthChartFrame title="当日点测" hint="深色点为夜间窗口。">
        <HealthScatterChart points={detail.samples ?? []} format={(value) => `${Math.round(value * 100)}%`} />
      </HealthChartFrame>
    </>
  );
}

function dash(value: string | null): string {
  return value ?? "—";
}

function kcal(value?: number | null): string {
  return dash(value == null ? null : `${Math.round(value)} kcal`);
}

function bpm(value?: number | null): string {
  return dash(value == null ? null : `${Math.round(value)} bpm`);
}

function ms(value?: number | null): string {
  return dash(value == null ? null : `${Math.round(value)} ms`);
}

function kg(value?: number | null): string {
  return dash(value == null ? null : `${value.toFixed(1)} kg`);
}

function vo2(value?: number | null): string {
  return dash(value == null ? null : value.toFixed(1));
}

function spo2(value?: number | null): string {
  return dash(value == null ? null : `${Math.round(value * 100)}%`);
}

function percent01(value?: number | null): string {
  return dash(value == null ? null : `${Math.round(value * 100)}%`);
}

function count(value?: number | null, unit = ""): string {
  if (value == null) return "—";
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit ? `${rounded} ${unit}` : rounded;
}

function meters(value?: number | null): string {
  if (value == null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
  return `${Math.round(value)} m`;
}

function durationMinutes(value?: number | null): string {
  if (value == null) return "—";
  let hours = Math.floor(value / 60);
  let rest = Math.round(value % 60);
  if (rest === 60) {
    hours += 1;
    rest = 0;
  }
  if (hours <= 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分钟`;
}

function clock(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
