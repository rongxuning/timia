/**
 * Convert an AI draft (NaturalLanguageTaskDraft) into the initial values
 * that ``TaskDrawerWithComments`` understands in create mode.
 *
 * The TaskDrawer's create flow has props like ``title``, ``body``, ``startAt``,
 * ``endAt``, ``priority``, ``location`` — and ``externalWorkspaceId`` /
 * ``externalProjectId`` (the props the caller sets to bypass the pickers).
 */

export type ItemCreateInitial = {
  title: string;
  body: string | null;
  startAt: string | null;
  endAt: string | null;
  priority: string;
  status: string;
  location: string | null;
  details: string | null;
};

export type DraftShape = {
  title?: string | null;
  body?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  all_day?: boolean;
  status?: string;
  priority?: string;
  location?: string | null;
  recurrence_text?: string | null;
  assumptions?: string[] | null;
};

export function aiDraftToItemInitial(
  draft: DraftShape,
  fallbackContent: string,
): ItemCreateInitial {
  const title = (draft.title ?? "").trim() || fallbackContent.slice(0, 50) || "未命名任务";
  const assumptionsText = (draft.assumptions ?? [])
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .map((s) => `· ${s}`)
    .join("\n");
  const recurrenceText = draft.recurrence_text
    ? `\n\n⚠️ 包含重复表达：${draft.recurrence_text}`
    : "";
  const details = [assumptionsText, recurrenceText].filter(Boolean).join("\n") || null;

  return {
    title,
    body: draft.body ?? fallbackContent,
    startAt: draft.start_at ?? null,
    endAt: draft.end_at ?? null,
    priority: draft.priority ?? "1",
    status: draft.status ?? "todo",
    location: draft.location ?? null,
    details,
  };
}
