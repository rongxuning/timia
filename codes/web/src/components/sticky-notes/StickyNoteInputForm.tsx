"use client";

import { useRef, useState } from "react";
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

type Props = {
  onSubmit: (input: {
    title: string | null;
    content: string;
    location: LocationSnapshot | null;
    attachments: AttachmentPayload[];
    autoParse: boolean;
  }) => Promise<unknown>;
};

export function StickyNoteInputForm({ onSubmit }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [autoParse, setAutoParse] = useState(false);
  const [location, setLocation] = useState<LocationSnapshot | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    content.trim().length > 0 && !isSaving;

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
  }

  async function handleSave() {
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);
    try {
      // Create the note first, then upload the blobs to IndexedDB keyed by
      // the server-assigned attachment ids.
      const result = await onSubmit({
        title: title.trim() || null,
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
        autoParse,
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
      setAutoParse(false);
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? "保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      className="space-y-2 px-3 py-3"
    >
      <input
        type="text"
        placeholder="标题（可选）"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        className="w-full rounded-lg border border-border-subtle bg-surface-container-lowest px-3 py-2 text-subhead focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <textarea
        placeholder="内容"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={10000}
        className="w-full resize-none rounded-lg border border-border-subtle bg-surface-container-lowest px-3 py-2 text-subhead focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-bright px-2.5 py-1 text-caption text-text-secondary hover:bg-surface-container-lowest"
        >
          <span className="material-icons text-footnote" aria-hidden>
            attach_file
          </span>
          {pendingAttachments.length > 0
            ? `附件 (${pendingAttachments.length})`
            : "附件"}
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
        {pendingAttachments.map((p) => (
          <PendingAttachmentChip
            key={p.draftId}
            filename={p.filename}
            mimeType={p.mime_type}
            byteSize={p.byte_size}
            onRemove={() =>
              setPendingAttachments((prev) =>
                prev.filter((x) => x.draftId !== p.draftId),
              )
            }
          />
        ))}
        <LocationChip
          snapshot={location}
          busy={locationBusy}
          onClick={handleLocationClick}
          onClear={location ? () => setLocation(null) : undefined}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-caption text-text-secondary">
          <input
            type="checkbox"
            checked={autoParse}
            onChange={(e) => setAutoParse(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          保存后让 AI 解析
        </label>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-caption font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving && (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          保存
        </button>
      </div>
      {error && (
        <p className="text-caption text-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
