"use client";

import { useEffect, useState } from "react";
import { LabelColorPicker } from "@/components/LabelColorPicker";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
import { apiFetch } from "@/lib/api";
import type { WorkspaceOption } from "@/lib/api/workspaces";

type Props = {
  open: boolean;
  onClose: () => void;
  token: string | null;
  onSuccess?: (workspace: WorkspaceOption) => void;
};

export function WorkspaceModal({ open, onClose, token, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#FFFFFF");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEscapeDismiss({
    open,
    onDismiss: onClose,
    disabled: loading,
  });

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setColor("#FFFFFF");
    setError(null);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("请先登录");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入工作空间名称");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const created = await apiFetch<WorkspaceOption>("/workspaces", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: trimmed,
          description: description.trim() || null,
          color,
        }),
      });
      onSuccess?.({
        ...created,
        is_favorite: Boolean(created.is_favorite),
        created_at: created.created_at ?? "",
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "创建失败";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!loading) onClose();
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6">
        <div className="w-[min(720px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] space-y-5 overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-sm">
          <div className="font-semibold font-subhead">创建工作空间</div>
          <form onSubmit={onSubmit} className="space-y-4">
            <input
              className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="工作空间名称"
              disabled={loading}
            />
            <textarea
              className="min-h-[96px] w-full resize-none rounded-xl border border-border-subtle bg-surface-bright px-lg py-md"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述（可选）"
              disabled={loading}
            />
            <LabelColorPicker value={color} onChange={setColor} disabled={loading} />
            {error ? <div className="text-small text-error">{error}</div> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={loading}>
                取消
              </button>
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-2 text-on-primary"
                disabled={loading}
              >
                {loading ? "创建中…" : "创建"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
