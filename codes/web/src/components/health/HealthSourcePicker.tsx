"use client";

export const HEALTH_SOURCE_APPLE = "apple";

type HealthSourceOption = {
  id: string;
  label: string;
  visible: boolean;
};

const SOURCES: HealthSourceOption[] = [
  { id: HEALTH_SOURCE_APPLE, label: "苹果", visible: true },
  { id: "coros", label: "高驰", visible: false },
  { id: "garmin", label: "佳明", visible: false },
];

type HealthSourcePickerProps = {
  value: string;
  onChange: (id: string) => void;
};

export function HealthSourcePicker({ value, onChange }: HealthSourcePickerProps) {
  const visible = SOURCES.filter((item) => item.visible);

  return (
    <section className="rounded-xl border border-border-subtle bg-white px-md py-sm">
      <div className="flex items-baseline gap-sm">
        <h2 className="shrink-0 font-headline text-small text-text-primary">数据源</h2>
        <p className="min-w-0 text-caption text-neutral-muted">设备与平台</p>
      </div>
      <div className="mt-sm flex flex-wrap gap-sm">
        {visible.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={
                active
                  ? "rounded-lg bg-primary px-3 py-1.5 text-caption font-medium text-on-primary"
                  : "rounded-lg border border-border-subtle bg-white px-3 py-1.5 text-caption text-text-secondary hover:bg-gray-50"
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
