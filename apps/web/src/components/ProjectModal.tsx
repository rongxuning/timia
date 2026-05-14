"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type ProjectModalResult = {
  id: string;
  name: string;
  description?: string | null;
  archived?: boolean;
  created_at?: string;
  created_by_display_name?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string | null;
  mode: "create" | "edit";
  projectId?: string;
  initialName?: string;
  initialDescription?: string | null;
  onSuccess?: (project: ProjectModalResult) => void;
};

export function ProjectModal({
  open,
  onClose,
  workspaceId,
  token,
  mode,
  projectId,
  initialName = "",
  initialDescription = "",
  onSuccess,
}: Props) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === "edit") {
      setName(initialName);
      setDesc((initialDescription ?? "") as string);
    } else {
      setName("");
      setDesc("");
    }
  }, [open, mode, initialName, initialDescription]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入项目名称");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (mode === "create") {
        const created = await apiFetch<ProjectModalResult>(`/workspaces/${workspaceId}/projects`, {
          method: "POST",
          token,
          body: JSON.stringify({ name: trimmed, description: desc.trim() || null }),
        });
        onSuccess?.(created);
        onClose();
      } else {
        if (!projectId) {
          setError("缺少项目 ID");
          return;
        }
        const updated = await apiFetch<ProjectModalResult>(`/workspaces/${workspaceId}/projects/${projectId}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ name: trimmed, description: desc.trim() || null }),
        });
        onSuccess?.(updated);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message ?? (mode === "create" ? "创建失败" : "保存失败"));
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const title = mode === "create" ? "新建项目" : "编辑项目";

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!loading) onClose();
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
        <div className="w-[min(720px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div className="font-subhead font-semibold">{title}</div>
            <button
              className="text-sm underline disabled:opacity-50"
              type="button"
              disabled={loading}
              onClick={() => {
                if (!loading) onClose();
              }}
            >
              关闭
            </button>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface-variant" htmlFor="projectModalName">
                项目名称
              </label>
              <input
                id="projectModalName"
                className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：官网改版"
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-on-surface-variant" htmlFor="projectModalDesc">
                描述（可选）
              </label>
              <textarea
                id="projectModalDesc"
                className="min-h-[96px] w-full resize-none rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="这个项目主要做什么？"
                disabled={loading}
              />
            </div>
            {error && <div className="text-small text-error">{error}</div>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-50"
                onClick={() => onClose()}
                disabled={loading}
              >
                取消
              </button>
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"
                disabled={loading || !name.trim()}
              >
                {loading ? (mode === "create" ? "创建中…" : "保存中…") : mode === "create" ? "创建" : "保存"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
