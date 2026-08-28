"use client";

import { useState } from "react";
import type { HealthInsight } from "@/types/api/views/health";

function InsightBody({ insight }: { insight: HealthInsight }) {
  if (insight.status !== "success" || !insight.summary) {
    return <p className="text-small text-text-secondary">该日分析尚未生成。</p>;
  }
  return (
    <div className="space-y-md">
      <p className="text-small text-text-primary">{insight.summary}</p>
      {insight.trends && insight.trends.length > 0 ? (
        <div>
          <p className="text-overline text-zinc-400">趋势</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-small text-text-secondary">
            {insight.trends.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {insight.suggestions && insight.suggestions.length > 0 ? (
        <div>
          <p className="text-overline text-zinc-400">建议</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-small text-text-secondary">
            {insight.suggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type MyHealthInsightProps = {
  insight: HealthInsight | null | undefined;
  insights?: HealthInsight[];
  rangeMode?: boolean;
  loading?: boolean;
};

export function MyHealthInsight({ insight, insights, rangeMode, loading }: MyHealthInsightProps) {
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const list = insights ?? (insight ? [insight] : []);

  return (
    <section className="rounded-xl border border-border-subtle bg-white p-lg">
      <h2 className="font-headline text-lg font-bold text-text-primary">AI 智能分析</h2>
      <p className="mt-1 text-caption text-neutral-muted">仅为健康趋势观察，不能替代医疗建议。</p>
      {loading ? (
        <p className="mt-lg text-small text-text-secondary">加载中…</p>
      ) : rangeMode ? (
        list.length === 0 ? (
          <p className="mt-lg text-small text-text-secondary">该时间段还没有分析。</p>
        ) : (
          <ul className="mt-md divide-y divide-border-subtle">
            {list.map((item) => {
              const open = openDates[item.local_date] ?? false;
              return (
                <li key={item.local_date}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between py-3 text-left text-small text-text-primary"
                    aria-expanded={open}
                    onClick={() =>
                      setOpenDates((prev) => ({ ...prev, [item.local_date]: !open }))
                    }
                  >
                    <span>{item.local_date}</span>
                    <span className="text-caption text-neutral-muted">{open ? "收起" : "展开"}</span>
                  </button>
                  {open ? (
                    <div className="pb-3">
                      <InsightBody insight={item} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : !insight ? (
        <p className="mt-lg text-small text-text-secondary">该日分析尚未生成。</p>
      ) : (
        <div className="mt-md">
          <InsightBody insight={insight} />
        </div>
      )}
    </section>
  );
}
