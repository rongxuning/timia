import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api/generated";

export type StickyNoteOut = components["schemas"]["StickyNoteOut"];
export type StickyNoteListOut = components["schemas"]["StickyNoteListOut"];
export type StickyNoteAttachmentOut = components["schemas"]["StickyNoteAttachmentOut"];
export type StickyNoteLocationOut = components["schemas"]["StickyNoteLocationOut"];
export type StickyNoteAIParseOut = components["schemas"]["StickyNoteAIParseOut"];
export type StickyNoteCreate = components["schemas"]["StickyNoteCreate"];
export type StickyNoteUpdate = components["schemas"]["StickyNoteUpdate"];
export type StickyNoteConvertRequest = components["schemas"]["StickyNoteConvertRequest"];
export type StickyNoteConvertResponse = components["schemas"]["StickyNoteConvertResponse"];

export type AttachmentType = "text" | "image" | "audio" | "video" | "file";
export type LocationSource = "gps" | "ip" | "manual";

export type StickyNoteStatus =
  | "saved"
  | "parsing"
  | "parsed"
  | "parse_failed"
  | "converted"
  | "archived";

// ---- API ----------------------------------------------------------------

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const filtered = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (filtered.length === 0) return path;
  const search = new URLSearchParams();
  for (const [k, v] of filtered) search.set(k, String(v));
  return `${path}?${search.toString()}`;
}

export function listStickyNotes(
  token: string,
  opts: { cursor?: string; limit?: number; includeArchived?: boolean } = {},
): Promise<StickyNoteListOut> {
  return apiFetch<StickyNoteListOut>(
    withQuery("/sticky-notes", {
      cursor: opts.cursor,
      limit: opts.limit ?? 50,
      include_archived: opts.includeArchived ? "true" : undefined,
    }),
    { token },
  );
}

export function createStickyNote(
  token: string,
  payload: StickyNoteCreate,
): Promise<StickyNoteOut> {
  return apiFetch<StickyNoteOut>("/sticky-notes", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function getStickyNote(token: string, id: string): Promise<StickyNoteOut> {
  return apiFetch<StickyNoteOut>(`/sticky-notes/${id}`, { token });
}

export function updateStickyNote(
  token: string,
  id: string,
  payload: StickyNoteUpdate,
): Promise<StickyNoteOut> {
  return apiFetch<StickyNoteOut>(`/sticky-notes/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export async function archiveStickyNote(token: string, id: string): Promise<void> {
  await apiFetch<void>(`/sticky-notes/${id}`, { method: "DELETE", token });
}

export function triggerStickyNoteParse(
  token: string,
  id: string,
): Promise<StickyNoteAIParseOut> {
  return apiFetch<StickyNoteAIParseOut>(`/sticky-notes/${id}/ai-parse`, {
    method: "POST",
    token,
  });
}

export function getStickyNoteParses(
  token: string,
  id: string,
  opts: { onlyLatest?: boolean } = {},
): Promise<StickyNoteAIParseOut[]> {
  return apiFetch<StickyNoteAIParseOut[]>(
    withQuery(`/sticky-notes/${id}/parses`, {
      latest: opts.onlyLatest ? "true" : undefined,
    }),
    { token },
  );
}

export function convertStickyNoteToTask(
  token: string,
  id: string,
  payload: StickyNoteConvertRequest,
): Promise<StickyNoteConvertResponse> {
  return apiFetch<StickyNoteConvertResponse>(`/sticky-notes/${id}/convert`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

// ---- Status derivation ---------------------------------------------------

export function statusOf(note: StickyNoteOut): StickyNoteStatus {
  if (note.archived_at) return "archived";
  const p = note.latest_parse;
  if (!p) return "saved";
  switch (p.parse_status) {
    case "pending":
      return "parsing";
    case "success":
      return p.converted_item_id ? "converted" : "parsed";
    case "failed":
      return "parse_failed";
    case "skipped":
      return "saved";
  }
}
