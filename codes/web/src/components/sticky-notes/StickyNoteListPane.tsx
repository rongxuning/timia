"use client";

import type { StickyNoteOut } from "@/lib/api/sticky-notes";
import { StickyNoteCard } from "./StickyNoteCard";

type Props = {
  notes: StickyNoteOut[];
  isLoading: boolean;
  error: string | null;
  expandedParseId: string | null;
  selectedNoteId: string | null;
  selectingNoteId: string | null;
  onTriggerParse: (id: string) => Promise<void>;
  onArchive: (id: string) => Promise<void>;
  onConvert: (noteId: string, parseId: string) => Promise<void>;
  onToggleParse: (parseId: string) => void;
  onSelectNote: (note: StickyNoteOut) => void | Promise<void>;
  onOpenTask: (noteId: string, itemId: string) => void;
};

export function StickyNoteListPane({
  notes,
  isLoading,
  error,
  expandedParseId,
  selectedNoteId,
  selectingNoteId,
  onTriggerParse,
  onArchive,
  onConvert,
  onToggleParse,
  onSelectNote,
  onOpenTask,
}: Props) {
  if (isLoading && notes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center py-12 text-caption text-text-secondary">
        加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-12 text-caption text-error">
        {error}
      </div>
    );
  }
  if (notes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-12 text-text-secondary">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" className="text-text-tertiary" aria-hidden>
          <path d="M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H15l6-6V5c0-1.11-.9-2-2-2zm-7 6h4.5l-1.5-2H12v2zm-5 0h5v2H7v-2zm2 4h5.5l-2.75-4H9v4zm7.5-3H17v-3h-1v3h-1v-3h-1v3h-1v-3H12v3h1.5l2.5-4H19v4z"/>
        </svg>
        <p className="text-subhead">还没有便利贴</p>
        <p className="text-caption text-text-tertiary">
          在上面的输入框里写下你的第一条笔记
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2 p-2">
      {notes.map((note) => (
        <li key={note.id}>
          <StickyNoteCard
            note={note}
            isParseExpanded={
              !!expandedParseId && expandedParseId === note.latest_parse?.id
            }
            isSelected={selectedNoteId === note.id}
            isSelecting={selectingNoteId === note.id}
            onTriggerParse={onTriggerParse}
            onArchive={onArchive}
            onConvert={onConvert}
            onToggleParse={onToggleParse}
            onSelectNote={onSelectNote}
            onOpenTask={onOpenTask}
          />
        </li>
      ))}
    </ul>
  );
}
