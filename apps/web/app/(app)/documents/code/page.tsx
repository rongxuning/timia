export default function DocumentsCodePage() {
  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto">
        <h1 className="font-section-heading text-section-heading text-text-primary">文档 / 代码文档</h1>
        <p className="text-body text-text-secondary mt-2">这里用于放置与代码相关的说明与沉淀。</p>

        <div className="mt-6 flex flex-wrap gap-md">
          <a
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-lg py-md text-body font-medium hover:bg-surface-container-lowest transition-colors"
            href="/documents/code/api"
          >
            <span className="material-symbols-outlined text-[18px]">api</span>
            后端 API 一览
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-lg py-md text-body font-medium hover:bg-surface-container-lowest transition-colors"
            href="/documents/code/database"
          >
            <span className="material-symbols-outlined text-[18px]">account_tree</span>
            数据库结构图
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-lg py-md text-body font-medium hover:bg-surface-container-lowest transition-colors"
            href="/documents/code/database/data"
          >
            <span className="material-symbols-outlined text-[18px]">table</span>
            数据库表数据
          </a>
        </div>
      </div>
    </main>
  );
}

