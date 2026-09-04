"use client";

import { useState } from "react";
import { clearHealthData } from "@/lib/api/health-views";

type HealthDataManageProps = {
  token: string | null;
  onCleared: () => void;
};

export function HealthDataManage({ token, onCleared }: HealthDataManageProps) {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClear() {
    if (!token) return;
    setClearing(true);
    setError(null);
    setMessage(null);
    try {
      await clearHealthData(token);
      setConfirming(false);
      setMessage("已清除。请在 iPhone Timia → 健康与健身 再点同步。");
      onCleared();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err?.message ?? "清除失败");
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-white px-md py-sm">
      <div className="flex items-baseline gap-sm">
        <h2 className="shrink-0 font-headline text-small text-text-primary">数据管理</h2>
        <p className="min-w-0 text-caption text-neutral-muted">清除服务端健康样本后可重新同步</p>
      </div>

      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setMessage(null);
            setError(null);
          }}
          className="mt-sm rounded-lg border border-error/40 px-3 py-1.5 text-caption font-medium text-error hover:bg-error-container/10"
        >
          清除全部健康数据
        </button>
      ) : (
        <div className="mt-sm space-y-sm">
          <p className="text-caption text-text-secondary">
            将删除样本、训练、日汇总与同步水位，保留身高等档案。此操作不可撤销。
          </p>
          <div className="flex flex-wrap gap-sm">
            <button
              type="button"
              disabled={clearing || !token}
              onClick={() => void handleClear()}
              className="rounded-lg bg-error px-3 py-1.5 text-caption font-medium text-white disabled:opacity-60"
            >
              {clearing ? "清除中…" : "确认清除"}
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-border-subtle px-3 py-1.5 text-caption text-text-secondary hover:bg-gray-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-sm text-caption text-text-secondary">{message}</p>}
      {error && <p className="mt-sm text-caption text-error">{error}</p>}
    </section>
  );
}
