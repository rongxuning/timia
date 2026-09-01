"use client";

const RANGES = [
  { days: 7, label: "7 天" },
  { days: 30, label: "30 天" },
  { days: 90, label: "90 天" },
] as const;

type HealthRangePickerProps = {
  value: number | null;
  onChange: (days: number) => void;
};

export function HealthRangePicker({ value, onChange }: HealthRangePickerProps) {
  return (
    <section className="rounded-xl border border-border-subtle bg-white p-lg">
      <div className="flex items-baseline gap-sm">
        <h2 className="shrink-0 font-headline text-small text-text-primary">时间段</h2>
        <p className="min-w-0 text-caption text-neutral-muted">查看区间汇总与趋势</p>
      </div>
      <div className="mt-md grid grid-cols-3 gap-sm">
        {RANGES.map((item) => {
          const active = value === item.days;
          return (
            <button
              key={item.days}
              type="button"
              onClick={() => onChange(item.days)}
              className={
                active
                  ? "rounded-xl bg-primary px-2 py-2 text-caption font-medium text-on-primary"
                  : "rounded-xl border border-border-subtle bg-white px-2 py-2 text-caption text-text-secondary hover:bg-gray-50"
              }
              aria-pressed={active}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
