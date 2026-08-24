"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch, type ApiError } from "@/lib/api";

import { DATABASE_DOMAINS, TABLE_DOMAIN_MAP } from "../database-domains";

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

function TableSection({ table }: { table: DbTablePayload }) {
  return (
    <section className="space-y-md">
      <div className="flex items-baseline gap-sm">
        <h3 className="font-mono text-body font-semibold text-text-primary">{table.name}</h3>
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
  );
}

export default function DatabaseTableDataPage() {
  const [data, setData] = useState<DbTablesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [domainId, setDomainId] = useState<string>("all");

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

  const tableByName = useMemo(() => {
    if (!data) return new Map<string, DbTablePayload>();
    return new Map(data.tables.map((t) => [t.name, t]));
  }, [data]);

  const filteredTables = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.tables.filter((t) => {
      if (domainId !== "all") {
        const domain = TABLE_DOMAIN_MAP.get(t.name);
        if (domain?.id !== domainId) return false;
      }
      if (!q) return true;
      return t.name.toLowerCase().includes(q);
    });
  }, [data, filter, domainId]);

  const groupedSections = useMemo(() => {
    if (!data || domainId !== "all") return null;
    const q = filter.trim().toLowerCase();
    return DATABASE_DOMAINS.map((domain) => {
      const tables = domain.tables
        .map((name) => tableByName.get(name))
        .filter((t): t is DbTablePayload => Boolean(t))
        .filter((t) => !q || t.name.toLowerCase().includes(q));
      return { domain, tables };
    }).filter((g) => g.tables.length > 0);
  }, [data, domainId, filter, tableByName]);

  const uncategorizedTables = useMemo(() => {
    if (!data || domainId !== "all") return [];
    const q = filter.trim().toLowerCase();
    return filteredTables.filter((t) => !TABLE_DOMAIN_MAP.has(t.name));
  }, [data, domainId, filteredTables]);

  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto space-y-4xl">
        <div className="flex flex-col gap-sm sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-xs">
            <h1 className="font-section-heading text-section-heading text-text-primary">数据库表数据</h1>
            <p className="text-body text-text-secondary">
              各表当前数据预览（每表最多 200 行，按创建时间倒序）。密码 / refresh-token / 设备公钥 / challenge nonce
              已掩码。按业务域分组展示，与结构图域划分一致。
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

        {data ? (
          <div className="space-y-md">
            <div className="flex flex-wrap items-center gap-sm">
              <div className="relative min-w-[16rem] flex-1">
                <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[18px] text-text-secondary">
                  search
                </span>
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={`筛选表名（共 ${data.tables.length} 张）`}
                  className="w-full rounded-lg border border-border-subtle bg-surface py-sm pl-8 pr-md text-small text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none"
                />
              </div>
              <span className="text-small text-text-secondary">
                {filteredTables.length} / {data.tables.length} 张表
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDomainId("all")}
                className={`rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                  domainId === "all"
                    ? "bg-indigo-100 text-indigo-800"
                    : "bg-surface-container-high text-text-secondary hover:bg-surface-container-lowest"
                }`}
              >
                全部域
              </button>
              {DATABASE_DOMAINS.map((domain) => (
                <button
                  key={domain.id}
                  type="button"
                  onClick={() => setDomainId(domain.id)}
                  className={`rounded-full px-3 py-1 text-caption font-medium transition-colors ${
                    domainId === domain.id
                      ? domain.labelClass
                      : "bg-surface-container-high text-text-secondary hover:bg-surface-container-lowest"
                  }`}
                >
                  {domain.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-error-container bg-error-container/10 p-4 text-small text-error">
            {error}
          </div>
        ) : null}

        {loading && !data ? <div className="text-small text-text-secondary">加载中…</div> : null}

        {domainId === "all" && groupedSections
          ? groupedSections.map(({ domain, tables }) => (
              <section
                key={domain.id}
                className={`relative space-y-lg rounded-xl border-2 border-dashed bg-surface/60 p-4 pt-10 ${domain.borderClass}`}
              >
                <span
                  className={`absolute left-4 top-3 rounded-md px-2.5 py-1 text-caption font-semibold ${domain.labelClass}`}
                >
                  {domain.title}
                </span>
                <p className="text-caption text-text-secondary">{domain.description}</p>
                {tables.map((table) => (
                  <TableSection key={table.name} table={table} />
                ))}
              </section>
            ))
          : filteredTables.map((table) => <TableSection key={table.name} table={table} />)}

        {domainId === "all" && uncategorizedTables.length > 0 ? (
          <section className="relative space-y-lg rounded-xl border-2 border-dashed border-gray-300 bg-surface/60 p-4 pt-10">
            <span className="absolute left-4 top-3 rounded-md bg-gray-100 px-2.5 py-1 text-caption font-semibold text-gray-700">
              未归类
            </span>
            {uncategorizedTables.map((table) => (
              <TableSection key={table.name} table={table} />
            ))}
          </section>
        ) : null}

        {data && filteredTables.length === 0 && !loading ? (
          <p className="text-small text-text-secondary">没有匹配的表。</p>
        ) : null}
      </div>
    </main>
  );
}
