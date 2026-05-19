import Link from "next/link";

import { API_CATALOG, type ApiCatalogEntry } from "@/lib/api-catalog";
import { buildApiUsageIndex, type ApiUsageHit } from "@/lib/scan-web-api-usage";

/** 每次请求重新扫描源码，开发时改完接口调用即可在刷新后看到最新「是否使用」 */
export const dynamic = "force-dynamic";

function catalogKey(row: ApiCatalogEntry): string {
  return `${row.method} ${row.path}`;
}

function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <pre className="max-h-56 w-max max-w-none overflow-x-auto overflow-y-auto rounded-lg border border-border-subtle bg-surface-container-high/60 px-3 py-2 font-mono text-[11px] leading-relaxed text-text-primary whitespace-pre">
      {text}
    </pre>
  );
}

function UsageCell({ hits }: { hits: ApiUsageHit[] }) {
  if (hits.length === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-caption font-medium text-gray-600">
        未在 web 中识别到 apiFetch
      </span>
    );
  }
  const byFile = new Map<string, number[]>();
  for (const h of hits) {
    const arr = byFile.get(h.file) ?? [];
    arr.push(h.line);
    byFile.set(h.file, arr);
  }
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-caption font-medium text-emerald-800">
        已使用（{hits.length} 处调用）
      </span>
      <ul className="mt-1 max-h-32 overflow-y-auto text-caption text-text-secondary">
        {[...byFile.entries()].map(([file, lines]) => (
          <li key={file} className="font-mono text-[11px] leading-snug">
            {file}
            <span className="opacity-70"> :{[...new Set(lines)].sort((a, b) => a - b).join(", ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DocumentsCodeApiPage() {
  const usage = buildApiUsageIndex();

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

        <div className="mt-8 overflow-x-auto rounded-2xl border border-border-subtle bg-surface shadow-sm">
          <table className="w-full min-w-[2400px] border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-container-lowest/80">
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-text-primary">方法</th>
                <th className="min-w-[18rem] whitespace-nowrap px-4 py-3 font-semibold text-text-primary">路径</th>
                <th className="min-w-[16rem] whitespace-nowrap px-4 py-3 font-semibold text-text-primary">名称</th>
                <th className="min-w-[44rem] whitespace-nowrap px-4 py-3 font-semibold text-text-primary">入参</th>
                <th className="min-w-[44rem] whitespace-nowrap px-4 py-3 font-semibold text-text-primary">出参</th>
                <th className="min-w-[12rem] whitespace-nowrap px-4 py-3 font-semibold text-text-primary">前端使用</th>
              </tr>
            </thead>
            <tbody>
              {API_CATALOG.map((row) => {
                const key = catalogKey(row);
                const hits = usage.get(key) ?? [];
                return (
                  <tr key={key} className="border-b border-border-subtle align-top last:border-b-0 hover:bg-surface-container-lowest/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-caption font-semibold text-indigo-700">
                      {row.method}
                    </td>
                    <td className="min-w-[18rem] whitespace-nowrap px-4 py-3 font-mono text-caption text-text-primary">
                      {row.path}
                    </td>
                    <td className="min-w-[16rem] whitespace-nowrap px-4 py-3 text-body text-text-primary">{row.name}</td>
                    <td className="min-w-[44rem] whitespace-nowrap px-4 py-3 align-top">
                      <JsonBlock value={row.requestJson} />
                    </td>
                    <td className="min-w-[44rem] whitespace-nowrap px-4 py-3 align-top">
                      <JsonBlock value={row.responseJson} />
                    </td>
                    <td className="min-w-[12rem] px-4 py-3 text-caption">
                      <UsageCell hits={hits} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
