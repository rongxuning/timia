"use client";

import type { StickyNoteAttachmentOut, AttachmentType } from "@/lib/api/sticky-notes";

function readableSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
}

function TypeIcon({ mimeType, size = 12 }: { mimeType: string; size?: number }) {
  let path: string;
  if (mimeType.startsWith("image/")) {
    path = "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z";
  } else if (mimeType.startsWith("audio/")) {
    path = "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z";
  } else if (mimeType.startsWith("video/")) {
    path = "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z";
  } else if (mimeType.startsWith("text/")) {
    path = "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z";
  } else {
    path = "M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z";
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-text-secondary shrink-0" aria-hidden>
      <path d={path}/>
    </svg>
  );
}

type Props = {
  attachment: StickyNoteAttachmentOut;
  onRemove?: () => void;
  onClick?: () => void;
};

export function AttachmentChip({ attachment, onRemove, onClick }: Props) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-bright px-2 py-1 text-caption leading-none text-text-primary">
      <TypeIcon mimeType={attachment.mime_type} />
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
          ×
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
      <TypeIcon mimeType={mimeType} />
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
        ×
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
