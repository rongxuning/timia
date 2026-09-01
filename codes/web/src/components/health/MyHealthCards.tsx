"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HealthSparkline } from "@/components/health/HealthSparkline";
import { HEALTH_CARD_KEYS } from "@/components/health/healthCards";
import { useCardReorderAnimation } from "@/hooks/useCardReorderAnimation";
import type { HealthCurrent, HealthSeriesPoint } from "@/types/api/views/health";

function display(value: number | null | undefined, format: (n: number) => string): string {
  if (value == null) return "—";
  return format(value);
}

function sleepLabel(minutes: number | null | undefined): string {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours <= 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分钟`;
}

function standLabel(hours: number | null | undefined): string {
  if (hours == null) return "—";
  const n = Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
  return `${n} 小时`;
}

function ScoreHelp({ formula, hint }: { formula: string; hint: string }) {
  return (
    <span className="group/help relative z-10 inline-flex self-stretch hover:z-30">
      <button
        type="button"
        className="inline-flex aspect-square h-auto self-stretch items-center justify-center rounded-full border border-current p-0 text-[0.68em] leading-none text-neutral-muted hover:bg-gray-50 hover:text-text-secondary"
        aria-label="评分说明"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        ?
      </button>
      <span
        role="tooltip"
        className="absolute left-0 top-full z-20 hidden w-72 max-w-[min(18rem,calc(100vw-2rem))] pt-1 group-hover/help:block group-focus-within/help:block"
      >
        <span className="block rounded-xl border border-border-subtle bg-white px-md py-sm text-caption leading-5 text-text-secondary shadow-lg">
          <span className="block">公式：{formula}</span>
          <span className="mt-1 block">{hint}</span>
        </span>
      </span>
    </span>
  );
}

type CardDef = {
  key: string;
  seriesKey: string;
  label: string;
  value: string;
  total: string | null;
};

export function cardsFromCurrent(
  current: HealthCurrent | undefined,
  totals: HealthCurrent | null | undefined,
  loading: boolean,
  rangeMode: boolean,
): CardDef[] {
  const valueOrDash = (text: string) => (loading ? "—" : text);
  return [
    {
      key: "steps",
      seriesKey: "steps",
      label: rangeMode ? "步数" : "今日步数",
      value: valueOrDash(display(current?.steps, (n) => Math.round(n).toLocaleString("zh-CN"))),
      total: rangeMode
        ? valueOrDash(display(totals?.steps, (n) => `累计 ${Math.round(n).toLocaleString("zh-CN")}`))
        : null,
    },
    {
      key: "active",
      seriesKey: "active_energy_kcal",
      label: "活动消耗",
      value: valueOrDash(display(current?.active_energy_kcal, (n) => `${Math.round(n)} kcal`)),
      total: rangeMode
        ? valueOrDash(display(totals?.active_energy_kcal, (n) => `累计 ${Math.round(n)} kcal`))
        : null,
    },
    {
      key: "basal",
      seriesKey: "basal_energy_kcal",
      label: "静态消耗",
      value: valueOrDash(display(current?.basal_energy_kcal, (n) => `${Math.round(n)} kcal`)),
      total: rangeMode
        ? valueOrDash(display(totals?.basal_energy_kcal, (n) => `累计 ${Math.round(n)} kcal`))
        : null,
    },
    {
      key: "exercise",
      seriesKey: "exercise_minutes",
      label: "锻炼分钟",
      value: valueOrDash(display(current?.exercise_minutes, (n) => `${Math.round(n)} 分钟`)),
      total: rangeMode
        ? valueOrDash(display(totals?.exercise_minutes, (n) => `累计 ${Math.round(n)} 分钟`))
        : null,
    },
    {
      key: "stand",
      seriesKey: "stand_hours",
      label: "站立时间",
      value: valueOrDash(display(current?.stand_hours, standLabel)),
      total: rangeMode ? valueOrDash(display(totals?.stand_hours, (n) => `累计 ${standLabel(n)}`)) : null,
    },
    {
      key: "rhr",
      seriesKey: "resting_hr_bpm",
      label: "静息心率",
      value: valueOrDash(display(current?.resting_hr_bpm, (n) => `${Math.round(n)} bpm`)),
      total: null,
    },
    {
      key: "sleep",
      seriesKey: "sleep_asleep_minutes",
      label: rangeMode ? "睡眠" : "昨夜睡眠",
      value: valueOrDash(sleepLabel(current?.sleep_asleep_minutes)),
      total: rangeMode ? valueOrDash(display(totals?.sleep_asleep_minutes, (n) => `累计 ${sleepLabel(n)}`)) : null,
    },
    {
      key: "weight",
      seriesKey: "body_mass_kg",
      label: "最近体重",
      value: valueOrDash(display(current?.body_mass_kg, (n) => `${n.toFixed(1)} kg`)),
      total: null,
    },
    {
      key: "hrv",
      seriesKey: "hrv_median_ms",
      label: "HRV",
      value: valueOrDash(display(current?.hrv_median_ms, (n) => `${Math.round(n)} ms`)),
      total: null,
    },
    {
      key: "vo2",
      seriesKey: "vo2_max",
      label: "VO2 Max",
      value: valueOrDash(display(current?.vo2_max, (n) => n.toFixed(1))),
      total: null,
    },
    {
      key: "recovery",
      seriesKey: "cardio_recovery_bpm",
      label: "有氧恢复",
      value: valueOrDash(display(current?.cardio_recovery_bpm, (n) => `${Math.round(n)} bpm`)),
      total: null,
    },
    {
      key: "spo2",
      seriesKey: "spo2_avg",
      label: "血氧",
      value: valueOrDash(display(current?.spo2_avg, (n) => `${Math.round(n * 100)}%`)),
      total: null,
    },
  ];
}

function scoreLabel(score: number | null | undefined, loading: boolean): string {
  if (loading) return "—";
  if (score == null) return "none";
  return String(score);
}

type MyHealthCardsProps = {
  current?: HealthCurrent;
  totals?: HealthCurrent | null;
  scores?: Record<string, number | null>;
  scoreFormulas?: Record<string, { formula: string; hint: string }>;
  cardOrder?: string[];
  series?: Record<string, HealthSeriesPoint[]>;
  loading?: boolean;
  rangeMode?: boolean;
  onReorder?: (cardOrder: string[]) => void;
  onOpenDetail?: (cardKey: string) => void;
};

export function MyHealthCards({
  current,
  totals,
  scores,
  scoreFormulas,
  cardOrder,
  series,
  loading,
  rangeMode,
  onReorder,
  onOpenDetail,
}: MyHealthCardsProps) {
  const defs = cardsFromCurrent(current, totals, Boolean(loading), Boolean(rangeMode));
  const byKey = useMemo(() => new Map(defs.map((card) => [card.key, card])), [defs]);
  const [order, setOrder] = useState<string[]>(() =>
    cardOrder && cardOrder.length > 0 ? cardOrder : [...HEALTH_CARD_KEYS],
  );
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const dragEndedAt = useRef(0);

  useEffect(() => {
    if (cardOrder && cardOrder.length > 0) setOrder(cardOrder);
  }, [cardOrder]);

  const gridRef = useCardReorderAnimation(order.join("|"));
  const ordered = order.map((key) => byKey.get(key)).filter((card): card is CardDef => Boolean(card));

  const moveCard = (fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(to, 0, fromKey);
    setOrder(next);
    onReorder?.(next);
  };

  return (
    <section className="rounded-xl border border-border-subtle bg-white p-lg">
      <h2 className="font-headline text-lg font-bold text-text-primary">健康数据</h2>
      <p className="mt-1 text-caption text-neutral-muted">
        点击卡片查看详情；按住可拖动排序，顺序会保存到账号。
      </p>
      <div ref={gridRef} className="mt-lg grid grid-cols-1 gap-lg sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((card) => (
          <section
            key={card.key}
            data-card-reorder-id={card.key}
            draggable
            onDragStart={(event) => {
              setDraggingKey(card.key);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", card.key);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const fromKey = event.dataTransfer.getData("text/plain") || draggingKey;
              if (fromKey) moveCard(fromKey, card.key);
              setDraggingKey(null);
            }}
            onDragEnd={() => {
              setDraggingKey(null);
              dragEndedAt.current = Date.now();
            }}
            onClick={() => {
              if (Date.now() - dragEndedAt.current < 400) return;
              onOpenDetail?.(card.key);
            }}
            className={`flex min-w-0 cursor-pointer items-stretch justify-between gap-sm rounded-xl border border-border-subtle bg-white px-lg py-md transition-all hover:shadow-lg active:cursor-grabbing ${
              draggingKey === card.key ? "opacity-60" : ""
            }`}
          >
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-semibold leading-none text-primary">{card.label}</span>
                <span className="inline-flex items-stretch gap-1 text-sm leading-none text-text-secondary">
                  <span className="tabular-nums">{scoreLabel(scores?.[card.key], Boolean(loading))}</span>
                  <ScoreHelp
                    formula={
                      scoreFormulas?.[card.key]?.formula ??
                      "clamp(round(100 × 值 / 目标), 0, 100)"
                    }
                    hint={scoreFormulas?.[card.key]?.hint ?? "总分100分。无数据时展示 none。"}
                  />
                </span>
              </div>
              <div>
                <span className="font-headline text-subhead text-text-primary">{card.value}</span>
                <p className="mt-1 min-h-4 text-caption text-neutral-muted">
                  {card.total && card.total !== "—" ? card.total : "\u00a0"}
                </p>
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-end">
              <HealthSparkline points={series?.[card.seriesKey] ?? []} />
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
