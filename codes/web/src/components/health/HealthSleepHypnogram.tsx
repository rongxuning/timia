"use client";

import { HealthEmptyHint } from "@/components/health/HealthChartFrame";

const STAGE_RANK: Record<string, number> = {
  awake: 3,
  rem: 2,
  core: 1,
  unspecified: 1,
  deep: 0,
};

const STAGE_LABEL: Record<string, string> = {
  in_bed: "在床",
  awake: "清醒",
  rem: "REM",
  core: "核心",
  deep: "深睡",
  unspecified: "未分期",
};

const STAGE_COLOR: Record<string, string> = {
  awake: "#d97706",
  rem: "#7c3aed",
  core: "#2563eb",
  deep: "#1e3a8a",
  unspecified: "#0f766e",
};

const SHARE_ORDER = [
  { key: "awake", label: "清醒", color: STAGE_COLOR.awake },
  { key: "rem", label: "REM", color: STAGE_COLOR.rem },
  { key: "core", label: "核心", color: STAGE_COLOR.core },
  { key: "deep", label: "深睡", color: STAGE_COLOR.deep },
] as const;

export type HealthSleepSegment = {
  start_at: string;
  end_at: string;
  stage: string;
};

type StageShare = {
  key: string;
  label: string;
  color: string;
  minutes: number;
  percent: number;
};

type HealthSleepHypnogramProps = {
  segments: HealthSleepSegment[];
};

export function HealthSleepHypnogram({ segments }: HealthSleepHypnogramProps) {
  const staged = segments.filter((item) => item.stage !== "in_bed");
  if (staged.length === 0) {
    return <HealthEmptyHint text="这一夜还没有睡眠分期。" />;
  }
  const starts = staged.map((item) => new Date(item.start_at).getTime());
  const ends = staged.map((item) => new Date(item.end_at).getTime());
  const t0 = Math.min(...starts);
  const t1 = Math.max(...ends);
  const span = Math.max(1, t1 - t0);
  const padL = 36;
  const padR = 8;
  const padT = 8;
  const padB = 16;
  const width = 288;
  const height = 88;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const rowH = plotH / 4;
  const xAt = (iso: string) => padL + ((new Date(iso).getTime() - t0) / span) * plotW;
  const yAt = (stage: string) => padT + (3 - (STAGE_RANK[stage] ?? 1)) * rowH;
  const shares = sharesFromMinutes(minutesFromSegments(staged));

  return (
    <div className="flex justify-center">
      <div className="inline-flex max-w-full items-center gap-sm">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-28 w-64 max-w-[min(100%,16rem)] shrink-0" role="img">
        {["深睡", "核心", "REM", "清醒"].map((label, index) => (
          <text
            key={label}
            x={padL - 4}
            y={padT + (3 - index) * rowH + rowH * 0.7}
            textAnchor="end"
            className="fill-neutral-muted"
            fontSize="8"
          >
            {label}
          </text>
        ))}
        {staged.map((segment, index) => {
          const x = xAt(segment.start_at);
          const w = Math.max(1, xAt(segment.end_at) - x);
          return (
            <rect
              key={`${segment.start_at}-${index}`}
              x={x}
              y={yAt(segment.stage)}
              width={w}
              height={rowH * 0.7}
              fill={STAGE_COLOR[segment.stage] ?? "#64748b"}
              rx="1"
            >
              <title>{`${STAGE_LABEL[segment.stage] ?? segment.stage}`}</title>
            </rect>
          );
        })}
        <text x={padL} y={height - 2} className="fill-neutral-muted" fontSize="8">
          {formatClock(new Date(t0))}
        </text>
        <text x={padL + plotW} y={height - 2} textAnchor="end" className="fill-neutral-muted" fontSize="8">
          {formatClock(new Date(t1))}
        </text>
      </svg>
      <SleepStageShareList shares={shares} />
      </div>
    </div>
  );
}

export function HealthSleepStageAverage({
  deepMinutes,
  coreMinutes,
  remMinutes,
  awakeMinutes,
}: {
  deepMinutes?: number | null;
  coreMinutes?: number | null;
  remMinutes?: number | null;
  awakeMinutes?: number | null;
}) {
  const minutes = {
    deep: deepMinutes ?? 0,
    core: coreMinutes ?? 0,
    rem: remMinutes ?? 0,
    awake: awakeMinutes ?? 0,
  };
  const shares = sharesFromMinutes(minutes);
  const total = shares.reduce((sum, part) => sum + part.minutes, 0);
  if (total <= 0) {
    return <HealthEmptyHint text="这段时间还没有睡眠分期。" />;
  }
  return (
    <div className="flex justify-center">
      <div className="inline-flex max-w-full items-center gap-sm">
        <div className="flex h-4 w-64 max-w-[min(100%,16rem)] overflow-hidden rounded-full">
          {shares
            .filter((part) => part.minutes > 0)
            .slice()
            .reverse()
            .map((part) => (
              <span
                key={part.key}
                className="h-full"
                style={{ width: `${(part.minutes / total) * 100}%`, backgroundColor: part.color }}
                title={`${part.label} ${part.percent}%`}
              />
            ))}
        </div>
        <SleepStageShareList shares={shares} />
      </div>
    </div>
  );
}

function SleepStageShareList({ shares }: { shares: StageShare[] }) {
  return (
    <ul className="w-28 shrink-0 space-y-sm text-caption text-text-secondary">
      {shares.map((part) => (
        <li key={part.key} className="flex items-center justify-between gap-sm">
          <span className="flex items-center gap-sm">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: part.color }} />
            {part.label}
          </span>
          <span className="tabular-nums">{part.percent}%</span>
        </li>
      ))}
    </ul>
  );
}

function minutesFromSegments(segments: HealthSleepSegment[]): Record<string, number> {
  const minutes = { deep: 0, core: 0, rem: 0, awake: 0 };
  for (const segment of segments) {
    const duration = Math.max(0, (new Date(segment.end_at).getTime() - new Date(segment.start_at).getTime()) / 60000);
    const key = segment.stage === "unspecified" ? "core" : segment.stage;
    if (key in minutes) minutes[key as keyof typeof minutes] += duration;
  }
  return minutes;
}

function sharesFromMinutes(minutes: Record<string, number>): StageShare[] {
  const total = SHARE_ORDER.reduce((sum, part) => sum + (minutes[part.key] ?? 0), 0);
  return SHARE_ORDER.map((part) => ({
    ...part,
    minutes: minutes[part.key] ?? 0,
    percent: total > 0 ? Math.round(((minutes[part.key] ?? 0) / total) * 100) : 0,
  }));
}

function formatClock(date: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
