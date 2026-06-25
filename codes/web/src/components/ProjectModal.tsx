"use client";

import { useEffect, useState } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";
import { apiFetch } from "@/lib/api";
import { fetchWorkspaceCards } from "@/lib/api/workspace-views";
import type { WorkspaceOption } from "@/lib/api/workspaces";

export type ProjectModalResult = {
  id: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  archived?: boolean;
  created_at?: string;
  created_by_display_name?: string | null;
};

export type ProjectModalSuccessMeta = {
  workspaceChanged: boolean;
  workspaceName?: string;
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
  onSuccess?: (project: ProjectModalResult, meta?: ProjectModalSuccessMeta) => void;
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
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOption[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmTransferOpen(false);
    if (mode === "edit") {
      setName(initialName);
      setDesc((initialDescription ?? "") as string);
      setSelectedWorkspaceId(workspaceId);
    } else {
      setName("");
      setDesc("");
      setSelectedWorkspaceId(workspaceId);
    }
  }, [open, mode, initialName, initialDescription, workspaceId]);

  useEffect(() => {
    if (!open || mode !== "edit" || !token) return;
    let cancelled = false;
    setWorkspacesLoading(true);
    fetchWorkspaceCards(token)
      .then((cards) => {
        if (cancelled) return;
        const ownerOptions: WorkspaceOption[] = cards
          .filter((c) => c.my_workspace_role === "owner")
          .map((c) => ({ id: c.id, name: c.name, description: c.description }));
        if (workspaceId && !ownerOptions.some((w) => w.id === workspaceId)) {
          const current = cards.find((c) => c.id === workspaceId);
          if (current) {
            ownerOptions.unshift({
              id: current.id,
              name: current.name,
              description: current.description,
            });
          }
        }
        setWorkspaceOptions(ownerOptions);
      })
      .catch((e: { message?: string }) => {
        if (!cancelled) setError(e?.message ?? "工作空间列表加载失败");
      })
      .finally(() => {
        if (!cancelled) setWorkspacesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, token, workspaceId]);

  const workspaceChanged =
    mode === "edit" && !!selectedWorkspaceId && selectedWorkspaceId !== workspaceId;
  const targetWorkspaceName =
    workspaceOptions.find((w) => w.id === selectedWorkspaceId)?.name ?? "目标工作空间";

  async function saveProject() {
    if (!token) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入项目名称");
      return;
    }
    if (mode === "edit" && !projectId) {
      setError("缺少项目 ID");
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
        const body: Record<string, unknown> = {
          name: trimmed,
          description: desc.trim() || null,
        };
        if (workspaceChanged) {
          body.target_workspace_id = selectedWorkspaceId;
        }
        const updated = await apiFetch<ProjectModalResult>(
          `/workspaces/${workspaceId}/projects/${projectId}`,
          {
            method: "PATCH",
            token,
            body: JSON.stringify(body),
          },
        );
        onSuccess?.(updated, {
          workspaceChanged,
          workspaceName: workspaceChanged ? targetWorkspaceName : undefined,
        });
        onClose();
      }
    } catch (err: any) {
      setError(err?.message ?? (mode === "create" ? "创建失败" : "保存失败"));
    } finally {
      setLoading(false);
      setConfirmTransferOpen(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (workspaceChanged) {
      setConfirmTransferOpen(true);
      return;
    }
    void saveProject();
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
            {mode === "edit" ? (
              <div className="rounded-xl border border-border-subtle bg-surface-container-lowest/40 p-4 space-y-4">
                <div className="text-overline text-zinc-500 tracking-wide">归属</div>
                <SearchableSelect
                  label="工作空间"
                  placeholder="搜索工作空间…"
                  options={workspaceOptions.map((w) => ({ id: w.id, label: w.name }))}
                  value={selectedWorkspaceId || null}
                  onChange={setSelectedWorkspaceId}
                  loading={workspacesLoading}
                  disabled={loading}
                  emptyText="暂无可迁移的工作空间（需为目标空间负责人）"
                />
                {workspaceChanged ? (
                  <p className="text-caption text-neutral-muted">
                    保存后将把项目及全部任务、成员迁移至「{targetWorkspaceName}」。
                  </p>
                ) : null}
              </div>
            ) : null}
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

      {confirmTransferOpen ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              if (!loading) setConfirmTransferOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-transfer-confirm-title"
            className="relative w-[min(480px,calc(100vw-2rem))] rounded-xl border border-border-subtle bg-surface p-6 shadow-lg space-y-4"
          >
            <div id="project-transfer-confirm-title" className="font-subhead font-semibold">
              确认迁移项目
            </div>
            <p className="text-small text-text-secondary">
              将把项目「{name.trim() || "未命名"}」及全部任务、成员迁移至工作空间「{targetWorkspaceName}
              」。项目成员在项目内的角色保持不变；尚未加入目标工作空间的成员将以成员身份加入。此操作不可从界面撤销，是否继续？
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-border-subtle px-4 py-2 text-sm disabled:opacity-50"
                onClick={() => setConfirmTransferOpen(false)}
                disabled={loading}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2 text-sm text-on-primary disabled:opacity-50"
                onClick={() => void saveProject()}
                disabled={loading}
              >
                {loading ? "迁移中…" : "确认迁移"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
