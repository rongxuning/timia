"use client";

import type { ReactNode } from "react";

type HealthChartFrameProps = {
  title: string;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
};

export function HealthChartFrame({ title, hint, aside, children }: HealthChartFrameProps) {
  return (
    <section className="mt-lg">
      <div className="flex flex-wrap items-baseline gap-x-md gap-y-1">
        <h3 className="text-small font-medium text-text-primary">{title}</h3>
        {aside}
      </div>
      {hint ? <p className="mt-1 text-caption text-neutral-muted">{hint}</p> : null}
      <div className="mt-sm">{children}</div>
    </section>
  );
}

export function HealthEmptyHint({ text }: { text: string }) {
  return <p className="py-md text-caption text-neutral-muted">{text}</p>;
}

export function HealthStatGrid({ items }: { items: { label: string; value: string }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-lg grid grid-cols-2 gap-md sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-caption text-neutral-muted">{item.label}</dt>
          <dd className="mt-1 text-small font-medium tabular-nums text-text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HealthSleepStatGrid({ items }: { items: { label: string; value: string }[] }) {
  if (items.length === 0) return null;
  return (
    <dl className="mt-lg grid grid-cols-2 gap-md sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-small font-medium text-text-primary">{item.label}</dt>
          <dd className="mt-1 text-caption tabular-nums text-neutral-muted">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
