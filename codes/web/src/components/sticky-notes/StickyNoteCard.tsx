"use client";

import { useState } from "react";
import type { StickyNoteOut, StickyNoteAIParseOut } from "@/lib/api/sticky-notes";
import {
  statusOf,
  STICKY_NOTE_STATUS_LABELS,
} from "@/lib/api/sticky-notes";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
import { StickyNoteDraftPreview } from "./StickyNoteDraftPreview";

type Props = {
  note: StickyNoteOut;
  isParseExpanded: boolean;
  isSelected: boolean;
  isSelecting: boolean;
  onTriggerParse: (id: string) => Promise<StickyNoteAIParseOut | undefined>;
  onArchive: (id: string) => Promise<void>;
  onConvert: (noteId: string, parseId: string) => Promise<void>;
  onToggleParse: (parseId: string) => void;
  onSelectNote: (note: StickyNoteOut) => void | Promise<void>;
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
  isSelected,
  isSelecting,
  onTriggerParse,
  onArchive,
  onConvert,
  onToggleParse,
  onSelectNote,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const status = statusOf(note);
  const parse = note.latest_parse ?? null;
  const attachmentCount = note.attachments?.length ?? 0;
  const locationLabel = note.location
    ? note.location.name ??
      `(${note.location.lat.toFixed(4)}, ${note.location.lng.toFixed(4)})`
    : "暂无地点";

  useEscapeDismiss({
    open: confirmDeleteOpen,
    onDismiss: () => setConfirmDeleteOpen(false),
    disabled: busy,
  });

  async function handleTriggerParse() {
    setParseError(null);
    setBusy(true);
    try {
      await onTriggerParse(note.id);
    } catch (err: unknown) {
      setParseError(
        (err as { message?: string })?.message ?? "AI 解析失败，请稍后重试",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    setDeleteError(null);
    setBusy(true);
    try {
      await onArchive(note.id);
      setConfirmDeleteOpen(false);
    } catch (err: unknown) {
      setDeleteError(
        (err as { message?: string })?.message ?? "删除便利贴失败",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-xl border border-border-subtle bg-surface p-3 shadow-sm">
      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          isSelecting
            ? "cursor-wait opacity-70"
            : "cursor-pointer transition-colors hover:bg-surface-container-lowest/60"
        } ${isSelected ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
        role="button"
        tabIndex={isSelecting ? -1 : 0}
        aria-label={`查看便利贴 ${note.title?.trim() || "未命名便利贴"}`}
        aria-busy={isSelecting}
        onClick={() => {
          if (!isSelecting) void onSelectNote(note);
        }}
        onKeyDown={(event) => {
          if (
            !isSelecting &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            void onSelectNote(note);
          }
        }}
      >
        <div className="min-w-0 space-y-1">
          <h3 className="truncate py-1 text-lg font-semibold text-text-primary">
            {note.title?.trim() || "未命名便利贴"}
          </h3>
          <p className="line-clamp-2 min-h-8 whitespace-pre-wrap py-1 text-small text-text-primary">
            {note.content.trim() || "暂无正文"}
          </p>
          <div className="flex min-h-8 items-center gap-1.5 py-2 text-caption text-text-secondary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
            </svg>
            <span className="truncate">{formatTime(note.recorded_at)}</span>
          </div>
          <div className="flex min-h-8 items-center gap-2 py-2 text-caption text-text-secondary">
            <span className="inline-flex min-w-0 items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
              </svg>
              <span className="truncate">{locationLabel}</span>
            </span>
            <span className="shrink-0 text-text-tertiary">·</span>
            <span className="inline-flex shrink-0 items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
              </svg>
              附件 {attachmentCount} 个
            </span>
          </div>
        </div>

        <aside
          className="flex min-w-[7rem] flex-col items-end justify-between gap-4"
          onClick={(event) => event.stopPropagation()}
        >
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

          {confirmDeleteOpen ? (
            <div
              role="alertdialog"
              aria-label="确认删除便利贴"
              className="w-full rounded-lg border border-error-container bg-error-container/10 p-2 text-right"
            >
              <p className="text-caption font-semibold text-error">确定删除？</p>
              <p className="mt-0.5 text-[11px] leading-4 text-error/80">删除后不可恢复</p>
              {deleteError && (
                <p className="mt-1 text-[11px] leading-4 text-error" role="alert">
                  {deleteError}
                </p>
              )}
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-container-lowest disabled:opacity-50"
                  onClick={() => setConfirmDeleteOpen(false)}
                  disabled={busy}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void handleArchive()}
                  disabled={busy}
                >
                  {busy ? "删除中…" : "删除"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setConfirmDeleteOpen(true);
              }}
              disabled={busy}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50/40 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="删除便利贴"
              title="删除便利贴"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </button>
          )}
        </aside>
      </div>

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
      {parseError && (
        <p className="mt-2 text-caption text-error" role="alert">
          {parseError}
        </p>
      )}
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
          className="inline-flex items-center gap-1 rounded-full bg-text-secondary/10 px-2 py-0.5 text-caption font-semibold text-text-secondary hover:bg-text-secondary/15 disabled:opacity-50"
          aria-label={`${STICKY_NOTE_STATUS_LABELS.saved}，开始 AI 解析`}
          title="开始 AI 解析"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/>
          </svg>
          {STICKY_NOTE_STATUS_LABELS.saved}
        </button>
      );
    case "parsing":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {STICKY_NOTE_STATUS_LABELS.parsing}
        </span>
      );
    case "parsed":
      return (
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-caption font-semibold text-success hover:bg-success/15"
          aria-label={`${STICKY_NOTE_STATUS_LABELS.parsed}，查看解析结果`}
          title="查看解析结果"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/>
          </svg>
          {STICKY_NOTE_STATUS_LABELS.parsed}
        </button>
      );
    case "parse_failed":
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full bg-error-container/20 px-2 py-0.5 text-caption font-semibold text-error hover:bg-error-container/30 disabled:opacity-50"
          aria-label={`${STICKY_NOTE_STATUS_LABELS.parse_failed}，重试 AI 解析`}
          title="重试 AI 解析"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          {STICKY_NOTE_STATUS_LABELS.parse_failed}
        </button>
      );
    case "converted":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-caption font-semibold text-success">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
          {STICKY_NOTE_STATUS_LABELS.converted}
        </span>
      );
    case "archived":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-text-secondary/10 px-2 py-0.5 text-caption text-text-secondary">
          {STICKY_NOTE_STATUS_LABELS.archived}
        </span>
      );
    case "skipped":
      return (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-full bg-text-secondary/10 px-2 py-0.5 text-caption font-semibold text-text-secondary hover:bg-text-secondary/15 disabled:opacity-50"
          aria-label={`${STICKY_NOTE_STATUS_LABELS.skipped}，重新开始 AI 解析`}
          title="重新开始 AI 解析"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2L9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2z"/>
          </svg>
          {STICKY_NOTE_STATUS_LABELS.skipped}
        </button>
      );
  }
}
