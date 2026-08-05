"use client";

import type { StickyNoteAttachmentOut, AttachmentType } from "@/lib/api/sticky-notes";

function iconForType(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "photo";
  if (mimeType.startsWith("audio/")) return "waveform";
  if (mimeType.startsWith("video/")) return "film";
  if (mimeType.startsWith("text/")) return "doc-text";
  return "paperclip";
}

function readableSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  attachment: StickyNoteAttachmentOut;
  onRemove?: () => void;
  onClick?: () => void;
};

export function AttachmentChip({ attachment, onRemove, onClick }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-bright px-2 py-1 text-caption leading-none text-text-primary">
      <span
        className="material-icons text-footnote text-text-secondary"
        aria-hidden
      >
        {iconForType(attachment.mime_type)}
      </span>
      <button
        type="button"
        className="max-w-[10rem] truncate hover:underline"
        onClick={onClick}
        title={`${attachment.filename} · ${readableSize(attachment.byte_size)}`}
      >
        {attachment.filename}
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
          aria-label="移除附件"
        >
          <span className="material-icons text-footnote" aria-hidden>
            close
          </span>
        </button>
      )}
    </span>
  );
}

export function PendingAttachmentChip({
  filename,
  mimeType,
  byteSize,
  onRemove,
}: {
  filename: string;
  mimeType: string;
  byteSize: number;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-bright px-2 py-1 text-caption leading-none text-text-primary">
      <span className="material-icons text-footnote text-text-secondary" aria-hidden>
        {iconForType(mimeType)}
      </span>
      <span className="max-w-[10rem] truncate" title={filename}>
        {filename}
      </span>
      <span className="text-caption text-text-secondary">
        {readableSize(byteSize)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="-mr-1 ml-0.5 flex h-5 w-5 items-center justify-center rounded-full text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
        aria-label="移除附件"
      >
        <span className="material-icons text-footnote" aria-hidden>
          close
        </span>
      </button>
    </span>
  );
}

export function detectAttachmentType(mimeType: string): AttachmentType {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("text/")) return "text";
  return "file";
}
