"use client";

import { useEffect, useId, useState } from "react";

import { SUMMARY_ER_DIAGRAM, type DatabaseDomain } from "./database-domains";

type ErDiagramSectionProps = {
  id: string;
  title: string;
  description?: string;
  diagram: string;
  borderClass: string;
  labelClass: string;
  dashed?: boolean;
};

export function ErDiagramSection({
  id,
  title,
  description,
  diagram,
  borderClass,
  labelClass,
  dashed = true,
}: ErDiagramSectionProps) {
  const reactId = useId().replace(/:/g, "");
  const renderId = `timia-db-er-${id}-${reactId}`;
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "strict",
        });
        const { svg: rendered } = await mermaid.render(renderId, diagram);
        if (!cancelled) setSvg(rendered);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "渲染失败";
        if (!cancelled) setError(message);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [diagram, renderId]);

  return (
    <section
      className={`relative rounded-xl bg-surface/60 p-4 pt-10 ${
        dashed ? `border-2 border-dashed ${borderClass}` : `border-2 ${borderClass}`
      }`}
    >
      <span
        className={`absolute left-4 top-3 rounded-md px-2.5 py-1 text-caption font-semibold ${labelClass}`}
      >
        {title}
      </span>
      {description ? <p className="mb-4 text-caption text-text-secondary">{description}</p> : null}
      {error ? (
        <div className="rounded-lg border border-error-container bg-error-container/10 p-3 text-small text-error">
          {error}
        </div>
      ) : svg ? (
        <div className="overflow-x-auto rounded-lg bg-white p-3">
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
      ) : (
        <div className="text-small text-text-secondary">渲染中…</div>
      )}
    </section>
  );
}

export function DomainErDiagram({ domain }: { domain: DatabaseDomain }) {
  return (
    <ErDiagramSection
      id={domain.id}
      title={domain.title}
      description={domain.description}
      diagram={domain.diagram}
      borderClass={domain.borderClass}
      labelClass={domain.labelClass}
    />
  );
}

export function SummaryErDiagram() {
  return (
    <ErDiagramSection
      id="summary"
      title="全局表关系总览"
      description="各业务域核心表与跨域外键一览；字段细节见下方分域 ER 图。"
      diagram={SUMMARY_ER_DIAGRAM}
      borderClass="border-slate-400"
      labelClass="bg-slate-100 text-slate-800"
      dashed={false}
    />
  );
}
