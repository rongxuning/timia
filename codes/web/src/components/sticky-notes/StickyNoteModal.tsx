"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDraggable } from "@/hooks/useDraggable";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
import {
  listStickyNotes,
  createStickyNote,
  updateStickyNote,
  archiveStickyNote,
  triggerStickyNoteParse,
  convertStickyNoteToTask,
  getLatestStickyNoteParse,
  isStickyNoteParseTerminal,
  STICKY_NOTE_PARSE_POLL_INTERVAL_MS,
  STICKY_NOTE_PARSE_POLL_TIMEOUT_MS,
  type StickyNoteAIParseOut,
  type StickyNoteOut,
  type StickyNoteListOut,
} from "@/lib/api/sticky-notes";
import { getAccessToken } from "@/lib/auth";
import { type LocationSnapshot } from "@/lib/sticky-notes/geolocation";
import {
  StickyNoteInputForm,
  type StickyNoteInputFormHandle,
} from "./StickyNoteInputForm";
import { StickyNoteListPane } from "./StickyNoteListPane";

type Props = {
  open: boolean;
  onClose: () => void;
  onConvertToTask?: (item: unknown) => void;
};

const STICKY_NOTE_TRANSITION_MS = 600;

function getTokenOrThrow(): string {
  const t = getAccessToken();
  if (!t) throw new Error("未登录");
  return t;
}

export function StickyNoteModal({ open, onClose, onConvertToTask }: Props) {
  const drag = useDraggable({ initialRight: 24, initialBottom: 24 });
  const [drawerMounted, setDrawerMounted] = useState(open);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [list, setList] = useState<StickyNoteListOut | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedParseId, setExpandedParseId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectingNoteId, setSelectingNoteId] = useState<string | null>(null);
  const inputFormRef = useRef<StickyNoteInputFormHandle>(null);
  const parsePollingRef = useRef<Map<string, { cancelled: boolean }>>(new Map());
  const openRef = useRef(open);
  const refreshRequestRef = useRef(0);

  useEscapeDismiss({
    open,
    onDismiss: onClose,
  });

  useEffect(() => {
    let firstFrame: number | undefined;
    let secondFrame: number | undefined;
    let unmountTimer: number | undefined;

    if (open) {
      setDrawerMounted(true);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setDrawerVisible(true));
      });
    } else {
      setDrawerVisible(false);
      unmountTimer = window.setTimeout(
        () => setDrawerMounted(false),
        STICKY_NOTE_TRANSITION_MS,
      );
    }

    return () => {
      if (firstFrame !== undefined) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
      if (unmountTimer !== undefined) window.clearTimeout(unmountTimer);
    };
  }, [open]);

  // Reset the expanded preview when the modal closes so a re-open is clean.
  useEffect(() => {
    if (!open) setExpandedParseId(null);
  }, [open]);

  useEffect(() => {
    openRef.current = open;
    if (open) return;
    for (const task of parsePollingRef.current.values()) task.cancelled = true;
    parsePollingRef.current.clear();
  }, [open]);

  useEffect(() => {
    return () => {
      refreshRequestRef.current += 1;
      for (const task of parsePollingRef.current.values()) task.cancelled = true;
      parsePollingRef.current.clear();
    };
  }, []);

  const applyLatestParse = (noteId: string, parse: StickyNoteAIParseOut) => {
    setList((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((note) =>
              note.id === noteId ? { ...note, latest_parse: parse } : note,
            ),
          }
        : prev,
    );
    if (parse.parse_status === "success" && !parse.converted_item_id) {
      setExpandedParseId(parse.id);
    } else if (parse.converted_item_id) {
      setExpandedParseId(null);
    }
  };

  async function pollParse(noteId: string, initial: StickyNoteAIParseOut) {
    const previous = parsePollingRef.current.get(noteId);
    if (previous) previous.cancelled = true;

    const task = { cancelled: false };
    parsePollingRef.current.set(noteId, task);
    let current = initial;
    const startedAt = Date.now();

    try {
      while (
        !task.cancelled &&
        !isStickyNoteParseTerminal(current) &&
        Date.now() - startedAt < STICKY_NOTE_PARSE_POLL_TIMEOUT_MS
      ) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STICKY_NOTE_PARSE_POLL_INTERVAL_MS);
        });
        if (task.cancelled) return;

        const latest = await getLatestStickyNoteParse(getTokenOrThrow(), noteId);
        if (!latest || task.cancelled) continue;

        current = latest;
        applyLatestParse(noteId, latest);
      }
    } catch {
      // Keep the last server state visible. The next list refresh can retry.
    } finally {
      if (parsePollingRef.current.get(noteId) === task) {
        parsePollingRef.current.delete(noteId);
      }
    }
  }

  const refreshList = async () => {
    const requestId = ++refreshRequestRef.current;
    const isActiveRequest = () =>
      openRef.current && requestId === refreshRequestRef.current;
    setIsLoadingList(true);
    setListError(null);
    try {
      const token = getTokenOrThrow();
      const data = await listStickyNotes(token, { limit: 50 });
      if (!isActiveRequest()) return;
      setList(data);
      for (const note of data.items) {
        if (note.latest_parse?.parse_status === "pending") {
          void pollParse(note.id, note.latest_parse);
        }
      }
    } catch (err: unknown) {
      if (!isActiveRequest()) return;
      setListError(
        (err as { message?: string })?.message ?? "便利贴列表加载失败",
      );
    } finally {
      if (isActiveRequest()) setIsLoadingList(false);
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
    setSelectedNoteId(null);
    return created;
  };

  const handleUpdate = async (
    id: string,
    input: {
      title: string | null;
      content: string;
      location: LocationSnapshot | null;
    },
  ) => {
    const token = getTokenOrThrow();
    const updated = await updateStickyNote(token, id, {
      title: input.title,
      content: input.content,
      location_name: input.location?.name ?? null,
    });
    setList((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((note) =>
              note.id === id ? updated : note,
            ),
          }
        : prev,
    );
    return updated;
  };

  const handleArchive = async (id: string) => {
    const token = getTokenOrThrow();
    await archiveStickyNote(token, id);
    setList((prev) =>
      prev ? { ...prev, items: prev.items.filter((n) => n.id !== id) } : prev,
    );
    if (selectedNoteId === id) {
      inputFormRef.current?.clearDraft();
      setSelectedNoteId(null);
    }
  };

  const handleSelectNote = async (note: StickyNoteOut) => {
    if (!inputFormRef.current || selectingNoteId) return;
    setSelectingNoteId(note.id);
    try {
      const draftSaveResult = await inputFormRef.current.saveDraftIfNeeded();
      if (draftSaveResult === "blocked") return;

      const location: LocationSnapshot | null = note.location
        ? {
            lat: note.location.lat,
            lng: note.location.lng,
            accuracy_m: note.location.accuracy_m ?? null,
            name: note.location.name ?? null,
            source: "gps",
          }
        : null;
      inputFormRef.current.loadDraft({
        title: note.title ?? "",
        content: note.content,
        location,
      });
      setSelectedNoteId(note.id);
      setExpandedParseId(null);
    } finally {
      setSelectingNoteId(null);
    }
  };

  const handleTriggerParse = async (id: string) => {
    const token = getTokenOrThrow();
    const updated = await triggerStickyNoteParse(token, id);
    applyLatestParse(id, updated);
    if (updated.parse_status === "pending") void pollParse(id, updated);
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

  if (!drawerMounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end">
      <div
        className={`absolute inset-0 bg-black/30 ${drawerVisible ? "" : "pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        ref={drag.panelRef}
        role="dialog"
        aria-label="便利贴"
        className={`flex max-h-[80vh] w-[864px] max-w-[calc(100vw-32px)] transform-gpu flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-2xl transition-transform duration-[600ms] ease-out motion-reduce:transition-none ${
          drawerVisible ? "translate-x-0" : "translate-x-full"
        }`}
        style={
          drag.position
            ? { left: drag.position.left, top: drag.position.top }
            : { marginRight: 24, marginBottom: 24 }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Draggable header */}
        <div
          ref={drag.handleRef}
          className="flex cursor-grab items-center justify-between gap-2 border-b border-border-subtle bg-surface-bright px-4 py-2 active:cursor-grabbing"
        >
          <div className="flex items-center gap-2">
            <span className="text-body font-semibold">便利贴</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-full px-3 py-1 text-caption text-text-secondary hover:bg-surface-container-lowest hover:text-text-primary"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </div>

        {/* Left-right layout */}
        <div className="flex min-h-0 flex-1">
          {/* Left: Input form */}
          <div className="w-1/2 border-r border-border-subtle">
            <StickyNoteInputForm
              ref={inputFormRef}
              editingNoteId={selectedNoteId}
              onSubmit={handleSubmit}
              onUpdate={handleUpdate}
              onClear={() => setSelectedNoteId(null)}
            />
          </div>

          {/* Right: List */}
          <div className="w-1/2 min-h-0 flex-1 overflow-y-auto bg-surface-container-lowest">
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
              selectedNoteId={selectedNoteId}
              selectingNoteId={selectingNoteId}
              onSelectNote={handleSelectNote}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
