"use client";

import { HealthDataManage } from "@/components/health/HealthDataManage";
import { HealthSourcePicker } from "@/components/health/HealthSourcePicker";

type HealthConfigPanelProps = {
  source: string;
  onSourceChange: (id: string) => void;
  token: string | null;
  onCleared: () => void;
};

/** 合并数据源与清除数据，压缩左侧栏高度。 */
export function HealthConfigPanel({
  source,
  onSourceChange,
  token,
  onCleared,
}: HealthConfigPanelProps) {
  return (
    <section className="rounded-xl border border-border-subtle bg-white px-md py-sm">
      <div className="flex items-baseline gap-sm">
        <h2 className="shrink-0 font-headline text-small text-text-primary">配置</h2>
        <p className="min-w-0 text-caption text-neutral-muted">数据源与数据管理</p>
      </div>
      <div className="mt-sm space-y-sm">
        <HealthSourcePicker value={source} onChange={onSourceChange} embedded />
        <div className="border-t border-border-subtle pt-sm">
          <HealthDataManage token={token} onCleared={onCleared} embedded />
        </div>
      </div>
    </section>
  );
}
