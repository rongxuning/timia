import Link from "next/link";

import { DATABASE_DOMAINS } from "./database-domains";
import { DomainErDiagram, SummaryErDiagram } from "./domain-er-diagram";

export default function DatabaseDiagramPage() {
  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto space-y-4xl">
        <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-xs">
            <h1 className="font-section-heading text-section-heading text-text-primary">数据库结构</h1>
            <p className="text-body text-text-secondary">
              顶部为全局表关系总览，下方按业务领域展开字段级 ER 图（迁移 `0001` → `0025`）。跨域外键在总览图中以关系线标注。
            </p>
          </div>
          <a
            className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg border border-border-subtle bg-surface px-md py-sm text-small font-medium text-text-primary hover:bg-surface-container-lowest transition-colors sm:self-auto"
            href="/documents/code/database/data"
          >
            <span className="material-symbols-outlined text-[16px]">table</span>
            查看表数据
          </a>
        </div>

        <SummaryErDiagram />

        <div className="space-y-md">
          <h2 className="font-subsection-heading text-subsection-heading text-text-primary">分域 ER 图</h2>
          <p className="text-small text-text-secondary">
            业务关联紧密的表归入同一域，彩色虚线框标注领域名称。
          </p>
        </div>

        <div className="grid gap-4xl xl:grid-cols-2">
          {DATABASE_DOMAINS.map((domain) => (
            <DomainErDiagram key={domain.id} domain={domain} />
          ))}
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-container-lowest/50 p-lg text-small text-text-secondary">
          <p className="font-medium text-text-primary">跨域关联摘要</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <code>items.source_plan_*</code> 指向规划导入来源（模板 / 时段 / 导入运行）。
            </li>
            <li>
              <code>plan_subscriptions</code>、<code>plan_apply_runs</code> 关联{" "}
              <code>workspaces</code> 与 <code>projects</code>。
            </li>
            <li>
              <code>sticky_note_ai_parses.converted_item_id</code> 可关联到 <code>items</code>。
            </li>
          </ul>
          <Link
            href="/documents/code"
            className="mt-3 inline-flex items-center gap-1 text-indigo-700 hover:underline"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            返回代码文档
          </Link>
        </div>
      </div>
    </main>
  );
}
