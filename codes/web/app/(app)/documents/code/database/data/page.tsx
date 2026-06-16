"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch, type ApiError } from "@/lib/api";

type DbTablePayload = {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

type DbTablesResponse = {
  tables: DbTablePayload[];
};

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-text-secondary">—</span>;
  }
  if (typeof value === "object") {
    return (
      <code className="text-small font-mono whitespace-pre-wrap break-all text-text-primary">
        {JSON.stringify(value)}
      </code>
    );
  }
  const s = String(value);
  if (s.length > 160) {
    return (
      <span className="text-small text-text-primary" title={s}>
        {s.slice(0, 160)}…
      </span>
    );
  }
  return <span className="text-small text-text-primary">{s}</span>;
}

export default function DatabaseTableDataPage() {
  const [data, setData] = useState<DbTablesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DbTablesResponse>("/dev/db-tables");
      setData(res);
    } catch (e: unknown) {
      const err = e as ApiError;
      if (err?.status === 503 && err.message === "dev_db_tables_disabled") {
        setError(
          "接口未启用：在 codes/core-service/.env 中设置 ENABLE_DEV_DB_TABLES=true 后重启 API（仅建议在本地开发环境开启）。",
        );
      } else {
        setError(err?.message ?? "加载失败");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto space-y-4xl">
        <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-xs">
            <h1 className="font-section-heading text-section-heading text-text-primary">数据库表数据</h1>
            <p className="text-body text-text-secondary">
              各表当前数据预览（每表最多 200 行，按创建时间倒序）。用户表的密码列为掩码。需开启 API 的{" "}
              <code className="rounded bg-surface-container-high px-1 py-0.5 text-small">ENABLE_DEV_DB_TABLES</code>{" "}
              配置。
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            <a
              className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface px-md py-sm text-small font-medium text-text-primary hover:bg-surface-container-lowest transition-colors"
              href="/documents/code/database"
            >
              <span className="material-symbols-outlined text-[16px]">account_tree</span>
              结构图
            </a>
            <a
              className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface px-md py-sm text-small font-medium text-text-primary hover:bg-surface-container-lowest transition-colors"
              href="/documents/code"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              代码文档
            </a>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface px-md py-sm text-small font-medium text-text-primary hover:bg-surface-container-lowest transition-colors disabled:opacity-50"
              disabled={loading}
              onClick={() => void load()}
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              刷新
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {error}
          </div>
        ) : null}

        {loading && !data ? (
          <div className="text-small text-text-secondary">加载中…</div>
        ) : null}

        {data?.tables.map((table) => (
          <section key={table.name} className="space-y-md">
            <div className="flex items-baseline gap-sm">
              <h2 className="font-subsection-heading text-subsection-heading text-text-primary">{table.name}</h2>
              <span className="text-small text-text-secondary">
                {table.rows.length} 行
                {table.columns.length ? ` · ${table.columns.length} 列` : ""}
              </span>
            </div>
            {table.rows.length === 0 ? (
              <p className="text-small text-text-secondary">暂无数据</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface">
                <table className="min-w-full border-collapse text-left text-small">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-container-lowest">
                      {table.columns.map((col) => (
                        <th
                          key={col}
                          className="whitespace-nowrap px-md py-sm font-medium text-text-secondary first:pl-lg last:pr-lg"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border-subtle last:border-0 hover:bg-surface-container-lowest/60">
                        {table.columns.map((col) => (
                          <td key={col} className="max-w-[min(28rem,40vw)] px-md py-sm align-top first:pl-lg last:pr-lg">
                            <CellValue value={row[col]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
