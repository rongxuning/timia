"use client";

import type { StickyNoteOut, StickyNoteAIParseOut } from "@/lib/api/sticky-notes";
import { StickyNoteCard } from "./StickyNoteCard";

type Props = {
  notes: StickyNoteOut[];
  isLoading: boolean;
  error: string | null;
  expandedParseId: string | null;
  onTriggerParse: (id: string) => Promise<StickyNoteAIParseOut | undefined>;
  onArchive: (id: string) => Promise<void>;
  onConvert: (noteId: string, parseId: string) => Promise<void>;
  onToggleParse: (parseId: string) => void;
};

export function StickyNoteListPane({
  notes,
  isLoading,
  error,
  expandedParseId,
  onTriggerParse,
  onArchive,
  onConvert,
  onToggleParse,
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
        <span className="material-icons text-[40px] text-text-tertiary" aria-hidden>
          sticky_note_2
        </span>
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
            onTriggerParse={onTriggerParse}
            onArchive={onArchive}
            onConvert={onConvert}
            onToggleParse={onToggleParse}
          />
        </li>
      ))}
    </ul>
  );
}
