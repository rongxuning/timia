"use client";

import { HealthEmptyHint } from "@/components/health/HealthChartFrame";

type HealthStandGridProps = {
  cells: { hour: number; stood?: boolean | null }[];
  sitStreaks?: { start_hour: number; hours: number }[];
};

export function HealthStandGrid({ cells, sitStreaks }: HealthStandGridProps) {
  if (cells.length === 0 || cells.every((cell) => cell.stood == null)) {
    return <HealthEmptyHint text="这一天还没有站立时间样本。" />;
  }
  const sitting = new Set<number>();
  for (const streak of sitStreaks ?? []) {
    for (let hour = streak.start_hour; hour < streak.start_hour + streak.hours; hour += 1) {
      sitting.add(hour);
    }
  }
  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {cells.map((cell) => {
          const sittingHour = sitting.has(cell.hour);
          const tone =
            cell.stood == null
              ? "bg-gray-100"
              : cell.stood
                ? "bg-primary"
                : sittingHour
                  ? "bg-amber-200"
                  : "bg-gray-200";
          return (
            <div
              key={cell.hour}
              title={`${cell.hour}:00 ${cell.stood == null ? "无数据" : cell.stood ? "已站立" : "未站立"}`}
              className={`aspect-square rounded-sm ${tone}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-caption text-neutral-muted">
        <span>0 时</span>
        <span>12 时</span>
        <span>23 时</span>
      </div>
    </div>
  );
}
