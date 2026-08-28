"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCardReorderAnimation } from "@/hooks/useCardReorderAnimation";
import type { HealthCurrent, HealthSeriesPoint } from "@/types/api/views/health";

const DEFAULT_CARD_ORDER = [
  "steps",
  "active",
  "basal",
  "exercise",
  "stand",
  "rhr",
  "sleep",
  "weight",
  "hrv",
  "vo2",
  "recovery",
  "spo2",
];

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
  return Number.isInteger(hours) ? `${hours}` : hours.toFixed(1);
}

function formatAxisNumber(n: number): string {
  if (Math.abs(n) >= 100) return String(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  if (Math.abs(n) >= 10) return (Math.round(n * 10) / 10).toFixed(1);
  return String(Math.round(n * 100) / 100);
}

function formatAxisDate(iso: string): string {
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${Number(parts[1])}月${Number(parts[2])}日`;
}

function Sparkline({ points }: { points: HealthSeriesPoint[] }) {
  const valued = points.filter((point): point is HealthSeriesPoint & { value: number } => point.value != null);
  if (valued.length === 0) {
    return <p className="flex h-full min-h-[4.5rem] w-full items-center justify-end text-caption text-neutral-muted">暂无趋势</p>;
  }
  const values = valued.map((point) => point.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMin = Math.min(0, dataMin);
  const yMax = Math.max(0, dataMax);
  const span = yMax - yMin || 1;
  const latest = valued[valued.length - 1];
  const padL = 28;
  const padR = 2;
  const padT = 6;
  const padB = 12;
  const width = 168;
  const height = 76;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xAt = (index: number, count: number) =>
    padL + (count <= 1 ? plotW / 2 : (index / (count - 1)) * plotW);
  const yAt = (value: number) => padT + (1 - (value - yMin) / span) * plotH;
  const d = valued
    .map((point, index) => {
      const x = xAt(index, valued.length);
      const y = yAt(point.value);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const near = (a: number, b: number) => Math.abs(a - b) / span < 0.12;
  const yTicks = [
    { value: dataMax, label: formatAxisNumber(dataMax) },
    { value: 0, label: "0" },
    { value: dataMin, label: formatAxisNumber(dataMin) },
  ].filter((tick, index, all) => all.findIndex((item) => near(item.value, tick.value)) === index);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-full w-full text-primary"
      aria-hidden
    >
      <line
        x1={padL}
        y1={padT}
        x2={padL}
        y2={padT + plotH}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      <line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      <line
        x1={padL}
        y1={yAt(0)}
        x2={padL + plotW}
        y2={yAt(0)}
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      {yTicks.map((tick) => (
        <g key={`${tick.value}-${tick.label}`}>
          <line
            x1={padL - 3}
            y1={yAt(tick.value)}
            x2={padL}
            y2={yAt(tick.value)}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="1"
          />
          <text
            x={padL - 5}
            y={yAt(tick.value)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-neutral-muted"
            fontSize="8"
          >
            {tick.label}
          </text>
        </g>
      ))}
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text
        x={padL + plotW}
        y={height - 1}
        textAnchor="end"
        className="fill-neutral-muted"
        fontSize="8"
      >
        {formatAxisDate(latest.local_date)}
      </text>
    </svg>
  );
}

function ScoreHelp({ formula, hint }: { formula: string; hint: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex self-stretch">
      <button
        type="button"
        className="inline-flex aspect-square h-auto self-stretch items-center justify-center rounded-full border border-current p-0 text-[0.68em] leading-none text-neutral-muted hover:bg-gray-50 hover:text-text-secondary"
        aria-label="评分说明"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        ?
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute left-0 top-5 z-20 w-max min-w-[24rem] max-w-[min(42rem,calc(100vw-2rem))] rounded-xl border border-border-subtle bg-white px-md py-sm text-caption leading-5 text-text-secondary shadow-lg"
        >
          <span className="block whitespace-nowrap">公式：{formula}</span>
          <span className="mt-1 block whitespace-nowrap">{hint}</span>
        </span>
      ) : null}
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

function cardsFromCurrent(
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
      label: "站立小时",
      value: valueOrDash(display(current?.stand_hours, standLabel)),
      total: rangeMode ? valueOrDash(display(totals?.stand_hours, (n) => `累计 ${standLabel(n)} 小时`)) : null,
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
}: MyHealthCardsProps) {
  const defs = cardsFromCurrent(current, totals, Boolean(loading), Boolean(rangeMode));
  const byKey = useMemo(() => new Map(defs.map((card) => [card.key, card])), [defs]);
  const [order, setOrder] = useState<string[]>(() =>
    cardOrder && cardOrder.length > 0 ? cardOrder : DEFAULT_CARD_ORDER,
  );
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

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
      <p className="mt-1 text-caption text-neutral-muted">按住卡片可拖动排序，顺序会保存到账号。</p>
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
            onDragEnd={() => setDraggingKey(null)}
            className={`flex min-w-0 cursor-grab items-stretch justify-between gap-sm rounded-xl border border-border-subtle bg-white px-lg py-md transition-all hover:shadow-lg active:cursor-grabbing ${
              draggingKey === card.key ? "opacity-60" : ""
            }`}
          >
            <div className="flex min-w-0 shrink-0 flex-col gap-2">
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
              <Sparkline points={series?.[card.seriesKey] ?? []} />
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
