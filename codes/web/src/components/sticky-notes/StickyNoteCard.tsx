"use client";

import { useState } from "react";
import type { StickyNoteOut, StickyNoteAIParseOut } from "@/lib/api/sticky-notes";
import { statusOf } from "@/lib/api/sticky-notes";
import { AttachmentChip } from "./AttachmentChip";
import { StickyNoteDraftPreview } from "./StickyNoteDraftPreview";
import { triggerDownload } from "@/lib/sticky-notes/attachment-store";

type Props = {
  note: StickyNoteOut;
  isParseExpanded: boolean;
  onTriggerParse: (id: string) => Promise<StickyNoteAIParseOut | undefined>;
  onArchive: (id: string) => Promise<void>;
  onConvert: (noteId: string, parseId: string) => Promise<void>;
  onToggleParse: (parseId: string) => void;
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function StickyNoteCard({
  note,
  isParseExpanded,
  onTriggerParse,
  onArchive,
  onConvert,
  onToggleParse,
}: Props) {
  const [busy, setBusy] = useState(false);
  const status = statusOf(note);
  const parse = note.latest_parse ?? null;

  async function handleTriggerParse() {
    setBusy(true);
    try {
      await onTriggerParse(note.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    setBusy(true);
    try {
      await onArchive(note.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-border-subtle bg-surface p-3 shadow-sm">
      <header className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {note.title && (
            <h3 className="truncate text-body font-semibold text-text-primary">
              {note.title}
            </h3>
          )}
        </div>
        <ParseStatusBadge
          status={status}
          parse={parse}
          busy={busy}
          onClick={async () => {
            if (status === "parsed" && parse) {
              onToggleParse(parse.id);
              return;
            }
            await handleTriggerParse();
          }}
        />
      </header>
      {note.content && (
        <p className="mb-2 whitespace-pre-wrap text-subhead text-text-primary">
          {note.content}
        </p>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-caption text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <span className="material-icons text-footnote" aria-hidden>
            schedule
          </span>
          {formatTime(note.recorded_at)}
        </span>
        {note.location && (
          <span className="inline-flex items-center gap-1">
            <span className="material-icons text-footnote" aria-hidden>
              place
            </span>
            {note.location.name ??
              `(${note.location.lat.toFixed(4)}, ${note.location.lng.toFixed(4)})`}
          </span>
        )}
        {note.converted_count > 0 && (
          <span className="inline-flex items-center gap-1 text-text-tertiary">
            已转化 ×{note.converted_count}
          </span>
        )}
      </div>
      {(note.attachments ?? []).length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(note.attachments ?? []).map((att) => (
            <AttachmentChip
              key={att.id}
              attachment={att}
              onClick={() => {
                void triggerDownload(note.id, att.id, att.filename).catch(
                  (e: Error) => alert(e.message),
                );
              }}
            />
          ))}
        </div>
      )}
      {isParseExpanded && parse && parse.parse_status === "success" && (
        <div className="mt-2">
          <StickyNoteDraftPreview
            parse={parse}
            isConverting={busy}
            onConvert={async () => {
              setBusy(true);
              try {
                await onConvert(note.id, parse.id);
              } finally {
                setBusy(false);
              }
            }}
            onClose={() => onToggleParse(parse.id)}
          />
        </div>
      )}
      <footer className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={handleArchive}
          disabled={busy}
          className="inline-flex items-center gap-1 text-caption text-text-tertiary hover:text-text-primary disabled:opacity-50"
        >
          <span className="material-icons text-footnote" aria-hidden>
            delete
          </span>
          归档
        </button>
      </footer>
    </article>
  );
}

function ParseStatusBadge({
  status,
  parse,
  busy,
  onClick,
}: {
  status: ReturnType<typeof statusOf>;
  parse: StickyNoteAIParseOut | null;
  busy: boolean;
  onClick: () => void;
}) {
  switch (status) {
    case "saved":
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          <span className="material-icons text-footnote" aria-hidden>
            auto_awesome
          </span>
          AI 解析
        </button>
      );
    case "parsing":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-text-secondary/10 px-2 py-0.5 text-caption text-text-secondary">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-text-secondary border-t-transparent" />
          解析中…
        </span>
      );
    case "parsed":
      return (
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-caption font-semibold text-success"
        >
          <span className="material-icons text-footnote" aria-hidden>
            auto_awesome
          </span>
          已生成草稿
        </button>
      );
    case "parse_failed":
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-caption font-semibold text-warning"
        >
          <span className="material-icons text-footnote" aria-hidden>
            error
          </span>
          重试解析
        </button>
      );
    case "converted":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">
          <span className="material-icons text-footnote" aria-hidden>
            check_circle
          </span>
          已转化
        </span>
      );
    case "archived":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-text-secondary/10 px-2 py-0.5 text-caption text-text-secondary">
          已归档
        </span>
      );
  }
}
