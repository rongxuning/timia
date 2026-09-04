"use client";

import type { ReactNode } from "react";
import { HealthDataManage } from "@/components/health/HealthDataManage";
import { HealthMiniCalendar } from "@/components/health/HealthMiniCalendar";
import { HealthProfileForm } from "@/components/health/HealthProfileForm";
import { HealthRangePicker } from "@/components/health/HealthRangePicker";
import { HealthSourcePicker } from "@/components/health/HealthSourcePicker";
import { PageMain } from "@/components/layout";
import type { useMyHealthPage } from "@/hooks/useMyHealthPage";

type HealthPageFrameProps = {
  page: ReturnType<typeof useMyHealthPage>;
  children: ReactNode;
};

export function HealthPageFrame({ page, children }: HealthPageFrameProps) {
  const { view, loading, error, rangeMode, selectedDate, month, source } = page;

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="space-y-3xl">
        {error && (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-lg text-small text-error">
            {error}
          </div>
        )}
        <div className="grid items-start gap-lg lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-md self-start lg:sticky lg:top-lg">
            <HealthMiniCalendar
              month={view?.month ?? month}
              selectedDate={rangeMode ? null : (view?.selected_date ?? selectedDate)}
              days={view?.calendar_days ?? []}
              today={page.today}
              onMonthChange={page.setMonth}
              onSelectDate={page.setSelectedDate}
            />
            <HealthRangePicker value={page.rangeDays} onChange={page.setRangeDays} />
            <HealthProfileForm
              value={view?.profile}
              energyTargets={view?.energy_targets}
              saving={page.savingProfile}
              onSave={page.saveProfile}
            />
            <HealthSourcePicker value={source} onChange={page.setSource} />
            <HealthDataManage token={page.token} onCleared={page.reload} />
          </aside>
          <div className="min-w-0 space-y-lg overflow-x-clip">
            {loading && !view ? <p className="text-small text-text-secondary">加载中…</p> : children}
          </div>
        </div>
      </div>
    </PageMain>
  );
}
