export default function DocumentsPage() {
  return (
    <main className="min-h-screen px-container-padding py-8">
      <div className="max-w-container-max mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="font-section-heading text-section-heading text-text-primary">文档</h1>
          <p className="text-body text-text-secondary">项目文档与使用指南。</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-lg py-md text-body font-medium hover:bg-surface-container-lowest transition-colors"
            href="/documents/code"
          >
            <span className="material-symbols-outlined text-[18px]">code</span>
            代码文档
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-lg py-md text-body font-medium hover:bg-surface-container-lowest transition-colors"
            href="/documents/guide"
          >
            <span className="material-symbols-outlined text-[18px]">menu_book</span>
            使用指南
          </a>
        </div>
      </div>
    </main>
  );
}

