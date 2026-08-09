"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  detectAttachmentType,
  PendingAttachmentChip,
} from "./AttachmentChip";
import { LocationChip } from "./LocationChip";
import {
  isGeolocationAvailable,
  requestCurrentLocation,
  type LocationSnapshot,
} from "@/lib/sticky-notes/geolocation";
import { putAttachment } from "@/lib/sticky-notes/attachment-store";

type AttachmentPayload = {
  attachment_type: "text" | "image" | "audio" | "video" | "file";
  filename: string;
  mime_type: string;
  byte_size: number;
  width_px: number | null;
  height_px: number | null;
  duration_ms: number | null;
};

type PendingAttachment = AttachmentPayload & {
  localFile: File;
  draftId: string;
};

type DraftValues = {
  title: string;
  content: string;
  location: LocationSnapshot | null;
};

export type StickyNoteInputFormHandle = {
  saveDraftIfNeeded: () => Promise<"none" | "saved" | "blocked">;
  loadDraft: (draft: DraftValues) => void;
  clearDraft: () => void;
};

type Props = {
  editingNoteId: string | null;
  onSubmit: (input: {
    title: string | null;
    content: string;
    location: LocationSnapshot | null;
    attachments: AttachmentPayload[];
    autoParse: boolean;
  }) => Promise<unknown>;
  onUpdate: (
    id: string,
    input: {
      title: string | null;
      content: string;
      location: LocationSnapshot | null;
    },
  ) => Promise<unknown>;
  onClear: () => void;
};

export const StickyNoteInputForm = forwardRef<StickyNoteInputFormHandle, Props>(
  function StickyNoteInputForm(
    { editingNoteId, onSubmit, onUpdate, onClear },
    ref,
  ) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [location, setLocation] = useState<LocationSnapshot | null>(null);
    const [locationBusy, setLocationBusy] = useState(false);
    const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
    const [savingAction, setSavingAction] = useState<"save" | "update" | null>(
      null,
    );
    const [error, setError] = useState<string | null>(null);
    const [draftDirty, setDraftDirty] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isSaving = savingAction !== null;
    const hasRequiredFields =
      title.trim().length > 0 && content.trim().length > 0;
    const hasDraft =
      title.trim().length > 0 ||
      content.trim().length > 0 ||
      pendingAttachments.length > 0 ||
      location !== null;
    const canSave =
      hasRequiredFields && !isSaving && (draftDirty || editingNoteId !== null);
    const canUpdate =
      editingNoteId !== null && hasRequiredFields && !isSaving;
    const canClear = hasDraft || editingNoteId !== null;

    async function handleLocationClick() {
    if (!isGeolocationAvailable()) {
      setError("当前浏览器不支持位置服务");
      return;
    }
    setLocationBusy(true);
    try {
      const snap = await requestCurrentLocation();
      if (!snap) {
        setError("未获取到位置（可能未授权）");
      } else {
        setLocation(snap);
        setDraftDirty(true);
        setError(null);
      }
    } finally {
      setLocationBusy(false);
    }
  }

    function handleFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    const additions: PendingAttachment[] = [];
    for (const f of Array.from(files)) {
      if (f.size > 50 * 1024 * 1024) {
        setError(`${f.name} 超过 50 MB 上限`);
        continue;
      }
      additions.push({
        attachment_type: detectAttachmentType(f.type || "application/octet-stream"),
        filename: f.name,
        mime_type: f.type || "application/octet-stream",
        byte_size: f.size,
        width_px: null,
        height_px: null,
        duration_ms: null,
        localFile: f,
        draftId: crypto.randomUUID(),
      });
    }
    setPendingAttachments((prev) => [...prev, ...additions].slice(0, 9));
    if (additions.length > 0) setDraftDirty(true);
  }

    async function handleSave(): Promise<boolean> {
    if (!canSave) return false;
    setSavingAction("save");
    setError(null);
    try {
      // Create the note first, then upload the blobs to IndexedDB keyed by
      // the server-assigned attachment ids.
      const result = await onSubmit({
        title: title.trim(),
        content: content.trim(),
        location,
        attachments: pendingAttachments.map((p) => ({
          attachment_type: p.attachment_type,
          filename: p.filename,
          mime_type: p.mime_type,
          byte_size: p.byte_size,
          width_px: p.width_px,
          height_px: p.height_px,
          duration_ms: p.duration_ms,
        })),
        autoParse: false,
      });
      const created = result as { id: string; attachments: Array<{ id: string }> };
      // Pair pending files with server ids (1:1, same order).
      await Promise.all(
        pendingAttachments.map((p, idx) =>
          putAttachment(created.id, created.attachments[idx].id, p.localFile),
        ),
      );
      setTitle("");
      setContent("");
      setLocation(null);
      setPendingAttachments([]);
      setDraftDirty(false);
      return true;
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? "保存失败");
      return false;
    } finally {
      setSavingAction(null);
    }
  }

    async function handleUpdate(): Promise<boolean> {
    if (!editingNoteId || !canUpdate) return false;
    setSavingAction("update");
    setError(null);
    try {
      await onUpdate(editingNoteId, {
        title: title.trim() || null,
        content: content.trim(),
        location,
      });
      setDraftDirty(false);
      return true;
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? "更新失败");
      return false;
    } finally {
      setSavingAction(null);
    }
  }

    async function saveDraftIfNeeded(): Promise<"none" | "saved" | "blocked"> {
    const hasDraft =
      title.trim().length > 0 ||
      content.trim().length > 0 ||
      pendingAttachments.length > 0 ||
      location !== null;
    if (!draftDirty || !hasDraft) return "none";
    if (isSaving) {
      setError("正在保存，请稍候再切换便利贴");
      return "blocked";
    }
    if (!canSave) {
      setError("请先补充标题和内容，再切换便利贴");
      return "blocked";
    }
    return (await handleSave()) ? "saved" : "blocked";
  }

    function loadDraft(draft: DraftValues) {
    setTitle(draft.title);
    setContent(draft.content);
    setLocation(draft.location);
    setPendingAttachments([]);
    setError(null);
    setDraftDirty(false);
  }

    function clearDraft() {
    setTitle("");
    setContent("");
    setLocation(null);
    setPendingAttachments([]);
    setError(null);
    setDraftDirty(false);
    onClear();
  }

    useImperativeHandle(ref, () => ({
      saveDraftIfNeeded,
      loadDraft,
      clearDraft,
    }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      className="flex h-full flex-col gap-3 px-4 py-4"
    >
      <input
        type="text"
        placeholder="标题（必填）"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setDraftDirty(true);
        }}
        maxLength={200}
        required
        className="w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 py-2 text-subhead placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <textarea
        placeholder="内容（必填）"
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setDraftDirty(true);
        }}
        maxLength={10000}
        required
        className="min-h-0 flex-1 resize-none rounded-lg border border-border-subtle bg-surface-container-lowest px-3 py-2 text-subhead placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
      />

      <div className="mt-auto flex items-end justify-between gap-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-7 cursor-pointer items-center gap-1.5 appearance-none rounded-full border border-border-subtle bg-surface-bright px-3 text-caption text-text-secondary hover:bg-surface-container-lowest"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ display: "inline-block", verticalAlign: "middle" }} aria-hidden>
                <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
              </svg>
              <span>{pendingAttachments.length > 0
                ? `附件 (${pendingAttachments.length})`
                : "附件"}</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                handleFilesPicked(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingAttachments.map((p) => (
                <PendingAttachmentChip
                  key={p.draftId}
                  filename={p.filename}
                  mimeType={p.mime_type}
                  byteSize={p.byte_size}
                  onRemove={() =>
                    {
                      setPendingAttachments((prev) =>
                        prev.filter((x) => x.draftId !== p.draftId),
                      );
                      setDraftDirty(true);
                    }
                  }
                />
              ))}
            </div>
          )}
          <div className="w-fit">
            <LocationChip
              snapshot={location}
              busy={locationBusy}
              onClick={handleLocationClick}
              onClear={
                location
                  ? () => {
                      setLocation(null);
                      setDraftDirty(true);
                    }
                  : undefined
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearDraft}
            disabled={!canClear || isSaving}
            className="inline-flex items-center whitespace-nowrap rounded-full border border-border-subtle bg-surface-bright px-3 py-2 text-caption font-semibold text-text-secondary hover:bg-surface-container-lowest disabled:cursor-not-allowed disabled:opacity-50"
          >
            清空
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-caption font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingAction === "save" && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            保存
          </button>
          <button
            type="button"
            onClick={() => void handleUpdate()}
            disabled={!canUpdate}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-primary bg-transparent px-4 py-2 text-caption font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-border-subtle disabled:text-text-tertiary disabled:opacity-70"
          >
            {savingAction === "update" && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            )}
            更新
          </button>
        </div>
      </div>
      {error && (
        <p className="text-caption text-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
  },
);
