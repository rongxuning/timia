"use client";

import { useCallback, useEffect, useState } from "react";

import { API_CATALOG, type ApiCatalogEntry, type ApiUsageHit } from "@/lib/api-catalog";

const SESSION_KEY = "timia:api-usage-index:v1";

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

function UsageCell({ hits, loading }: { hits: ApiUsageHit[]; loading: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center rounded-full bg-surface-container-high px-2 py-0.5 text-caption font-medium text-text-secondary">
        扫描中…
      </span>
    );
  }
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

export function ApiCatalogTable() {
  const [usage, setUsage] = useState<Record<string, ApiUsageHit[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    setLoading(true);
    try {
      const force = opts?.force === true;
      const url = force ? "/api/documents/api-usage?force=1" : "/api/documents/api-usage";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, ApiUsageHit[]>;
      setUsage(data);
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
      } catch {
        // ignore quota / disabled storage
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // HMR / Fast Refresh 可能导致组件多次重新挂载；同一 tab 内只自动扫描一次
    try {
      const cached = sessionStorage.getItem(SESSION_KEY);
      if (cached) {
        setUsage(JSON.parse(cached) as Record<string, ApiUsageHit[]>);
        setLoading(false);
        return;
      }
    } catch {
      // ignore invalid JSON / disabled storage
    }

    void load();
  }, [load]);

  return (
    <div className="mt-8 overflow-x-auto rounded-2xl border border-border-subtle bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="text-caption text-text-secondary">
          {loading ? "正在扫描前端代码（仅当前 tab 首次自动执行）" : "已加载（可手动重新扫描）"}
        </div>
        <button
          type="button"
          onClick={() => void load({ force: true })}
          className="inline-flex items-center rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-caption font-medium text-text-primary hover:bg-surface-container-lowest transition-colors disabled:opacity-50"
          disabled={loading}
        >
          重新扫描
        </button>
      </div>
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
            const hits = usage?.[key] ?? [];
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
                  <UsageCell hits={hits} loading={loading} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
