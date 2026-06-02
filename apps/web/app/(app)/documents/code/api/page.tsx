import Link from "next/link";

import { ApiCatalogTable } from "./api-catalog-table";

export default function DocumentsCodeApiPage() {
  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-section-heading text-section-heading text-text-primary">后端 API 一览</h1>
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
