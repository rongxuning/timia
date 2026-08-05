"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "@/hooks/useDraggable";
import {
  listStickyNotes,
  createStickyNote,
  archiveStickyNote,
  triggerStickyNoteParse,
  convertStickyNoteToTask,
  statusOf,
  type StickyNoteOut,
  type StickyNoteListOut,
} from "@/lib/api/sticky-notes";
import { getAccessToken } from "@/lib/auth";
import { StickyNoteInputForm } from "./StickyNoteInputForm";
import { StickyNoteListPane } from "./StickyNoteListPane";
import { StickyNoteDraftPreview } from "./StickyNoteDraftPreview";

type Props = {
  open: boolean;
  onClose: () => void;
  onConvertToTask?: (item: unknown) => void;
};

function getTokenOrThrow(): string {
  const t = getAccessToken();
  if (!t) throw new Error("未登录");
  return t;
}

export function StickyNoteModal({ open, onClose, onConvertToTask }: Props) {
  const drag = useDraggable({ initialRight: 24, initialBottom: 24 });
  const [list, setList] = useState<StickyNoteListOut | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedParseId, setExpandedParseId] = useState<string | null>(null);

  // Reset the expanded preview when the modal closes so a re-open is clean.
  useEffect(() => {
    if (!open) setExpandedParseId(null);
  }, [open]);

  const refreshList = async () => {
    setIsLoadingList(true);
    setListError(null);
    try {
      const token = getTokenOrThrow();
      const data = await listStickyNotes(token, { limit: 50 });
      setList(data);
    } catch (err: unknown) {
      setListError(
        (err as { message?: string })?.message ?? "便利贴列表加载失败",
      );
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    if (open) void refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (input: {
    title: string | null;
    content: string;
    location: {
      lat: number;
      lng: number;
      accuracy_m: number | null;
      name: string | null;
      source: "gps";
    } | null;
    attachments: Array<{
      attachment_type: "text" | "image" | "audio" | "video" | "file";
      filename: string;
      mime_type: string;
      byte_size: number;
      width_px: number | null;
      height_px: number | null;
      duration_ms: number | null;
    }>;
    autoParse: boolean;
  }) => {
    const token = getTokenOrThrow();
    const created = await createStickyNote(token, {
      title: input.title,
      content: input.content,
      timezone:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : "Asia/Shanghai",
      location: input.location,
      attachments: input.attachments,
      auto_parse: input.autoParse,
    });
    // Optimistic prepend
    setList((prev) =>
      prev
        ? { ...prev, items: [created, ...prev.items] }
        : { items: [created], next_cursor: null },
    );
    return created;
  };

  const handleArchive = async (id: string) => {
    const token = getTokenOrThrow();
    await archiveStickyNote(token, id);
    setList((prev) =>
      prev ? { ...prev, items: prev.items.filter((n) => n.id !== id) } : prev,
    );
  };

  const handleTriggerParse = async (id: string) => {
    const token = getTokenOrThrow();
    const updated = await triggerStickyNoteParse(token, id);
    setList((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((n) =>
              n.id === id
                ? { ...n, latest_parse: updated }
                : n,
            ),
          }
        : prev,
    );
    if (updated.parse_status === "success") {
      setExpandedParseId(updated.id);
    }
    return updated;
  };

  const handleConvert = async (noteId: string, parseId: string) => {
    const token = getTokenOrThrow();
    // Workspace/project selection is wired through the task drawer in v1;
    // for now we just convert with the AI's strings (server will fall back
    // to most-recent-active when names don't match).
    const resp = await convertStickyNoteToTask(token, noteId, {
      parse_id: parseId,
      workspace_id: "",  // server falls back
      project_id: "",    // server falls back
      field_overrides: {},
    });
    setList((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((n) =>
              n.id === noteId ? resp.sticky_note : n,
            ),
          }
        : prev,
    );
    setExpandedParseId(null);
    onConvertToTask?.(resp.item);
  };

  const sortedNotes = useMemo<StickyNoteOut[]>(() => {
    if (!list) return [];
    return [...list.items].sort((a, b) => {
      return (b.recorded_at ?? "").localeCompare(a.recorded_at ?? "");
    });
  }, [list]);

  if (!open) return null;

  return (
    <div
      ref={drag.panelRef}
      role="dialog"
      aria-label="便利贴"
      className="fixed z-50 flex max-h-[80vh] w-[480px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-2xl"
      style={
        drag.position
          ? { left: drag.position.left, top: drag.position.top }
          : { right: 24, bottom: 24 }
      }
    >
      {/* Draggable header */}
      <div
        ref={drag.handleRef}
        className="flex cursor-grab items-center justify-between gap-2 border-b border-border-subtle bg-surface-bright px-4 py-2 active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <span className="material-icons text-body text-text-secondary" aria-hidden>
            sticky_note_2
          </span>
          <span className="text-body font-semibold">便利贴</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
            onClick={onClose}
            aria-label="关闭便利贴"
          >
            <span className="material-icons text-body" aria-hidden>
              close
            </span>
          </button>
        </div>
      </div>

      {/* Input form (top) */}
      <div className="border-b border-border-subtle">
        <StickyNoteInputForm onSubmit={handleSubmit} />
      </div>

      {/* List (bottom) */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-container-lowest">
        <StickyNoteListPane
          notes={sortedNotes}
          isLoading={isLoadingList}
          error={listError}
          expandedParseId={expandedParseId}
          onTriggerParse={handleTriggerParse}
          onArchive={handleArchive}
          onConvert={handleConvert}
          onToggleParse={(parseId) =>
            setExpandedParseId((prev) => (prev === parseId ? null : parseId))
          }
        />
      </div>
    </div>
  );
}
