import Link from "next/link";

import { ApiCatalogTable } from "./api-catalog-table";

export default function DocumentsCodeApiPage() {
  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-xs">
            <h1 className="font-section-heading text-section-heading text-text-primary">后端 API 一览</h1>
            <p className="text-body text-text-secondary">
              与 <code className="rounded bg-surface-container-high px-1 py-0.5 text-small">codes/core-service</code>{" "}
              FastAPI 路由对齐，含规划、健康同步 / 视图、收藏、通知等近期接口。视图类接口在{" "}
              <code className="rounded bg-surface-container-high px-1 py-0.5 text-small">/views/*</code>{" "}
              前缀下聚合展示数据。
            </p>
          </div>
          <Link
            href="/documents/code"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border-subtle bg-surface px-lg py-md text-body font-medium hover:bg-surface-container-lowest transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            返回代码文档
          </Link>
        </div>

        <ApiCatalogTable />
      </div>
    </main>
  );
}
