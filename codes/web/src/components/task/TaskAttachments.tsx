"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  deleteFile,
  fetchFileBlob,
  listItemFiles,
  MAX_ITEM_BINDINGS,
  uploadTaskFile,
  validateTaskMedia,
  type FileOut,
} from "@/lib/file-api";

type Props = {
  workspaceId: string;
  projectId: string;
  itemId: string | null;
  token: string | null;
  disabled?: boolean;
  pendingFiles: File[];
  onPendingFilesChange: (files: File[]) => void;
};

type PreviewState = {
  url: string;
  kind: "image" | "video";
  name: string;
  owned: boolean;
};

function objectUrlFor(file: File): string {
  return URL.createObjectURL(file);
}

export function TaskAttachments({
  workspaceId,
  projectId,
  itemId,
  token,
  disabled,
  pendingFiles,
  onPendingFilesChange,
}: Props) {
  const t = useTranslations("taskAttachments");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [remote, setRemote] = useState<FileOut[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const totalCount = remote.length + pendingFiles.length;

  const loadRemote = useCallback(async () => {
    if (!token || !itemId || !workspaceId || !projectId) {
      setRemote([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const items = await listItemFiles({ token, workspaceId, projectId, itemId });
      setRemote(items);
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : null;
      setError(message || t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, itemId, workspaceId, projectId, t]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  useEffect(() => {
    const urls = pendingFiles.map(objectUrlFor);
    setPendingUrls(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [pendingFiles]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const urls: string[] = [];
    const run = async () => {
      const next: Record<string, string> = {};
      for (const file of remote) {
        const path =
          file.kind === "video" ? file.poster_path || file.content_path : file.thumb_path || file.content_path;
        if (!path) continue;
        try {
          const blob = await fetchFileBlob(path, token);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          next[file.id] = url;
        } catch {
          /* thumb is optional */
        }
      }
      if (!cancelled) setThumbs(next);
    };
    void run();
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [remote, token]);

  function closePreview() {
    setPreview((prev) => {
      if (prev?.owned) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  async function openRemotePreview(file: FileOut) {
    if (!token) return;
    try {
      const blob = await fetchFileBlob(file.content_path, token);
      const url = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev?.owned) URL.revokeObjectURL(prev.url);
        return {
          url,
          kind: file.kind === "video" ? "video" : "image",
          name: file.original_filename,
          owned: true,
        };
      });
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : null;
      setError(message || t("loadFailed"));
    }
  }

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const remaining = MAX_ITEM_BINDINGS - totalCount;
    if (remaining <= 0) {
      setError(t("limit"));
      return;
    }
    const accepted: File[] = [];
    for (const file of incoming.slice(0, remaining)) {
      const check = validateTaskMedia(file);
      if (!check.ok) {
        setError(t(check.reason));
        continue;
      }
      accepted.push(file);
    }
    if (!accepted.length) return;

    if (!itemId) {
      onPendingFilesChange([...pendingFiles, ...accepted]);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (!token || !workspaceId || !projectId) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of accepted) {
        const created = await uploadTaskFile({ token, workspaceId, projectId, itemId, file });
        setRemote((prev) => [...prev, created]);
      }
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : null;
      setError(message || t("uploadFailed"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeRemote(fileId: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await deleteFile({ token, fileId });
      setRemote((prev) => prev.filter((f) => f.id !== fileId));
    } catch (e: unknown) {
      const message =
        e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : null;
      setError(message || t("uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  const addDisabled = disabled || busy || !workspaceId || !projectId || totalCount >= MAX_ITEM_BINDINGS;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-on-surface-variant" htmlFor={inputId}>
          {t("label")}
        </label>
        <button
          type="button"
          className="text-caption font-medium text-primary disabled:opacity-50"
          disabled={addDisabled}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? t("uploading") : t("add")}
        </button>
      </div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="sr-only"
        disabled={addDisabled}
        onChange={(e) => void onPick(e.target.files)}
      />
      {loading ? <p className="text-caption text-neutral-muted">{t("uploading")}</p> : null}
      {error ? <p className="text-caption text-error">{error}</p> : null}
      {!loading && totalCount === 0 ? <p className="text-caption text-neutral-muted">{t("empty")}</p> : null}
      <div className="grid grid-cols-3 gap-2">
        {remote.map((file) => (
          <div
            key={file.id}
            className="relative aspect-square overflow-hidden rounded-xl border border-border-subtle bg-surface-bright"
          >
            <button
              type="button"
              className="h-full w-full"
              aria-label={t("previewAria", { name: file.original_filename })}
              onClick={() => void openRemotePreview(file)}
              disabled={disabled || busy}
            >
              {thumbs[file.id] ? (
                file.kind === "video" ? (
                  <video src={thumbs[file.id]} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={thumbs[file.id]} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <span className="flex h-full items-center justify-center px-1 text-caption text-neutral-muted">
                  {file.original_filename}
                </span>
              )}
            </button>
            <button
              type="button"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-caption text-white"
              aria-label={t("deleteAria", { name: file.original_filename })}
              disabled={disabled || busy}
              onClick={() => void removeRemote(file.id)}
            >
              ×
            </button>
          </div>
        ))}
        {pendingFiles.map((file, index) => (
          <div
            key={`${file.name}-${index}`}
            className="relative aspect-square overflow-hidden rounded-xl border border-dashed border-border-subtle bg-surface-bright"
          >
            <button
              type="button"
              className="h-full w-full"
              aria-label={t("previewAria", { name: file.name })}
              onClick={() => {
                const url = pendingUrls[index];
                if (!url) return;
                setPreview((prev) => {
                  if (prev?.owned) URL.revokeObjectURL(prev.url);
                  return {
                    url,
                    kind: file.type.startsWith("video/") ? "video" : "image",
                    name: file.name,
                    owned: false,
                  };
                });
              }}
              disabled={disabled}
            >
              {pendingUrls[index] ? (
                file.type.startsWith("video/") ? (
                  <video src={pendingUrls[index]} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={pendingUrls[index]} alt="" className="h-full w-full object-cover" />
                )
              ) : null}
            </button>
            <button
              type="button"
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-caption text-white"
              aria-label={t("deleteAria", { name: file.name })}
              disabled={disabled}
              onClick={() => onPendingFilesChange(pendingFiles.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
          onClick={closePreview}
        >
          <button type="button" className="absolute right-4 top-4 text-white" aria-label={t("closePreview")}>
            ×
          </button>
          {preview.kind === "video" ? (
            <video
              src={preview.url}
              className="max-h-full max-w-full"
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-full max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
