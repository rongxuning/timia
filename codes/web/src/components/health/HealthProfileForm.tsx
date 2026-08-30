"use client";

import { useEffect, useState, type FormEvent } from "react";

export type HealthProfileValue = {
  sex?: string | null;
  age_years?: number | null;
  height_cm?: number | null;
  max_hr_bpm?: number | null;
};

type HealthProfileFormProps = {
  value?: HealthProfileValue | null;
  energyTargets?: { bmr_kcal: number; active_target_kcal: number } | null;
  saving?: boolean;
  onSave: (next: {
    sex: "male" | "female" | null;
    age_years: number | null;
    height_cm: number | null;
    max_hr_bpm: number | null;
  }) => void;
};

export function HealthProfileForm({ value, energyTargets, saving, onSave }: HealthProfileFormProps) {
  const [sex, setSex] = useState<"male" | "female" | null>(null);
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [maxHr, setMaxHr] = useState("");

  useEffect(() => {
    setSex(value?.sex === "male" || value?.sex === "female" ? value.sex : null);
    setAge(value?.age_years != null ? String(value.age_years) : "");
    setHeight(value?.height_cm != null ? String(value.height_cm) : "");
    setMaxHr(value?.max_hr_bpm != null ? String(value.max_hr_bpm) : "");
  }, [value?.sex, value?.age_years, value?.height_cm, value?.max_hr_bpm]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const ageYears = age.trim() === "" ? null : Number(age);
    const heightCm = height.trim() === "" ? null : Number(height);
    const maxHrBpm = maxHr.trim() === "" ? null : Number(maxHr);
    onSave({
      sex,
      age_years: ageYears != null && Number.isFinite(ageYears) ? Math.round(ageYears) : null,
      height_cm: heightCm != null && Number.isFinite(heightCm) ? heightCm : null,
      max_hr_bpm: maxHrBpm != null && Number.isFinite(maxHrBpm) ? Math.round(maxHrBpm) : null,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border-subtle bg-white px-sm py-md"
    >
      <div className="flex items-baseline gap-sm">
        <h2 className="shrink-0 font-headline text-small text-text-primary">基础信息</h2>
        <p className="min-w-0 text-caption text-neutral-muted">用于推算消耗、跑力与负荷</p>
      </div>
      <div className="mt-sm flex min-w-0 flex-nowrap items-stretch gap-1">
        <div className="flex shrink-0 gap-1">
          {[
            { id: "male" as const, label: "男" },
            { id: "female" as const, label: "女" },
          ].map((item) => {
            const active = sex === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSex(item.id)}
                className={
                  active
                    ? "w-7 rounded-lg bg-primary text-caption font-medium text-on-primary"
                    : "w-7 rounded-lg border border-border-subtle bg-white text-caption text-text-secondary hover:bg-gray-50"
                }
                aria-pressed={active}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">年龄（岁）</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={age}
            onChange={(event) => setAge(event.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="年龄"
            className="w-full min-w-0 rounded-lg border border-border-subtle bg-white py-1 pl-1 pr-5 text-small tabular-nums text-text-primary outline-none focus:border-primary"
          />
          <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-caption text-text-secondary">
            岁
          </span>
        </label>
        <label className="relative min-w-0 flex-[1.25]">
          <span className="sr-only">身高（厘米）</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={height}
            onChange={(event) => {
              const next = event.target.value.replace(/[^\d.]/g, "");
              const [whole, ...rest] = next.split(".");
              setHeight(rest.length > 0 ? `${whole.slice(0, 3)}.${rest.join("").slice(0, 1)}` : whole.slice(0, 3));
            }}
            placeholder="身高"
            className="w-full min-w-0 rounded-lg border border-border-subtle bg-white py-1 pl-1 pr-7 text-small tabular-nums text-text-primary outline-none focus:border-primary"
          />
          <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-caption text-text-secondary">
            厘米
          </span>
        </label>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">最大心率（次）</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={maxHr}
            onChange={(event) => setMaxHr(event.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="心率"
            className="w-full min-w-0 rounded-lg border border-border-subtle bg-white py-1 pl-1 pr-5 text-small tabular-nums text-text-primary outline-none focus:border-primary"
          />
          <span className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-caption text-text-secondary">
            次
          </span>
        </label>
      </div>
      {energyTargets ? (
        <p className="mt-sm text-caption text-text-secondary">
          推算基础代谢 {Math.round(energyTargets.bmr_kcal)} kcal，活动目标{" "}
          {Math.round(energyTargets.active_target_kcal)} kcal。
        </p>
      ) : (
        <p className="mt-sm text-caption text-neutral-muted">填写完整并有体重后，才会计算消耗分数。</p>
      )}
      <button
        type="submit"
        disabled={saving}
        className="mt-sm w-full rounded-lg bg-primary px-3 py-1 text-caption font-medium text-on-primary disabled:opacity-50"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </form>
  );
}
