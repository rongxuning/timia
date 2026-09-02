export default function DocumentsCodePage() {
  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto space-y-4xl">
        <div className="space-y-xs">
          <h1 className="font-section-heading text-section-heading text-text-primary">文档 / 代码文档</h1>
          <p className="text-body text-text-secondary">
            面向开发与排障的本地参考：后端接口契约、数据库结构（按业务域分组）与表数据预览。数据来自{" "}
            <code className="rounded bg-surface-container-high px-1 py-0.5 text-small">core-service</code>{" "}
            与迁移脚本，与生产环境可能略有差异。
          </p>
        </div>

        <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
          <a
            className="group flex flex-col gap-sm rounded-xl border border-border-subtle bg-surface p-lg hover:border-indigo-200 hover:bg-surface-container-lowest transition-colors"
            href="/documents/code/api"
          >
            <span className="material-symbols-outlined text-[22px] text-indigo-600">api</span>
            <span className="font-medium text-text-primary group-hover:text-indigo-800">后端 API 一览</span>
            <span className="text-small text-text-secondary">
              与 FastAPI 路由对齐的入参 / 出参说明，并扫描前端 <code>apiFetch</code> 调用以标注是否已接入。
            </span>
          </a>
          <a
            className="group flex flex-col gap-sm rounded-xl border border-border-subtle bg-surface p-lg hover:border-emerald-200 hover:bg-surface-container-lowest transition-colors"
            href="/documents/code/database"
          >
            <span className="material-symbols-outlined text-[22px] text-emerald-600">account_tree</span>
            <span className="font-medium text-text-primary group-hover:text-emerald-800">数据库结构图</span>
            <span className="text-small text-text-secondary">
              按身份、空间、任务、便利贴、规划、健康六个业务域展示 ER 图；关联紧密的表同域呈现，彩色虚线框标注域名。
            </span>
          </a>
          <a
            className="group flex flex-col gap-sm rounded-xl border border-border-subtle bg-surface p-lg hover:border-amber-200 hover:bg-surface-container-lowest transition-colors sm:col-span-2 lg:col-span-1"
            href="/documents/code/database/data"
          >
            <span className="material-symbols-outlined text-[22px] text-amber-600">table</span>
            <span className="font-medium text-text-primary group-hover:text-amber-800">数据库表数据</span>
            <span className="text-small text-text-secondary">
              各表最多 200 行预览，支持按业务域筛选；敏感字段已掩码。需开启{" "}
              <code className="rounded bg-surface-container-high px-1 py-0.5 text-[11px]">ENABLE_DEV_DB_TABLES</code>。
            </span>
          </a>
        </div>
      </div>
    </main>
  );
}
