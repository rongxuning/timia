"use client";

import { useId, useState, type MouseEvent } from "react";
import { ModalDialog } from "@/components/ModalDialog";
import { PRIORITY_OPTIONS } from "@/components/schedule/taskUtils";
import { SystemSelect } from "@/components/SystemSelect";
import { PlanRelativeCalendar, type PlanCalendarEmptyClick } from "./PlanRelativeCalendar";
import {
  defaultTimedRange,
  formatMinutes,
  isPlanPeriodKind,
  newSlotKey,
  parseMinutes,
  slotLimit,
  validateSlotTimes,
  type PlanSlotDraft,
} from "./planSlots";

type EditorState = {
  mode: "create" | "edit";
  key: string;
  rel_month: number | null;
  rel_day: number;
  title: string;
  body: string;
  location: string;
  priority: string;
  all_day: boolean;
  startText: string;
  endText: string;
};

const FIELD_CLASS =
  "w-full rounded-xl border border-border-subtle bg-surface-bright px-3 py-2 text-small text-text-primary outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10";

export type PlanSlotEditorProps = {
  periodKind: string;
  slots: PlanSlotDraft[];
  onChange?: (slots: PlanSlotDraft[]) => void;
  readOnly?: boolean;
  guide?: string;
};

export function PlanSlotEditor({ periodKind, slots, onChange, readOnly = false, guide }: PlanSlotEditorProps) {
  const titleId = useId();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isPlanPeriodKind(periodKind)) {
    return (
      <div className="rounded-xl border border-border-subtle bg-white p-lg text-small text-text-secondary">
        请先选择周期后再编辑时段
      </div>
    );
  }

  const limit = slotLimit(periodKind);

  function openCreate(coords: PlanCalendarEmptyClick) {
    if (readOnly) return;
    if (slots.length >= limit) {
      setError(`最多 ${limit} 个时段`);
      return;
    }
    const range = defaultTimedRange(coords.start_minute);
    setError(null);
    setEditor({
      mode: "create",
      key: newSlotKey(),
      rel_month: coords.rel_month,
      rel_day: coords.rel_day,
      title: "",
      body: "",
      location: "",
      priority: "1",
      all_day: coords.all_day,
      startText: formatMinutes(range.start_minute),
      endText: formatMinutes(range.end_minute),
    });
  }

  function openEdit(slot: PlanSlotDraft, _event: MouseEvent) {
    if (readOnly) return;
    setError(null);
    setEditor({
      mode: "edit",
      key: slot.key,
      rel_month: slot.rel_month,
      rel_day: slot.rel_day,
      title: slot.title,
      body: slot.body ?? "",
      location: slot.location ?? "",
      priority: slot.priority || "1",
      all_day: slot.all_day,
      startText: formatMinutes(slot.start_minute),
      endText: formatMinutes(slot.end_minute),
    });
  }

  function saveEditor() {
    if (!editor || !onChange) return;
    const title = editor.title.trim();
    if (!title) {
      setError("请填写时段标题");
      return;
    }
    let start = 0;
    let end = 1440;
    if (!editor.all_day) {
      const parsedStart = parseMinutes(editor.startText);
      const parsedEnd = parseMinutes(editor.endText);
      if (parsedStart == null || parsedEnd == null) {
        setError("时间格式为 HH:MM，结束可为 24:00");
        return;
      }
      const timeError = validateSlotTimes(false, parsedStart, parsedEnd);
      if (timeError) {
        setError(timeError);
        return;
      }
      start = parsedStart;
      end = parsedEnd;
    }
    const nextSlot: PlanSlotDraft = {
      key: editor.key,
      rel_month: editor.rel_month,
      rel_day: editor.rel_day,
      start_minute: start,
      end_minute: end,
      all_day: editor.all_day,
      title,
      body: editor.body.trim() || null,
      details: null,
      color: "#FFFFFF",
      priority: editor.priority || "1",
      location: editor.location.trim() || null,
      sort_index: 0,
    };
    if (editor.mode === "create") {
      if (slots.length >= limit) {
        setError(`最多 ${limit} 个时段`);
        return;
      }
      onChange([...slots, nextSlot]);
    } else {
      const existing = slots.find((slot) => slot.key === editor.key);
      onChange(
        slots.map((slot) =>
          slot.key === editor.key
            ? {
                ...nextSlot,
                details: existing?.details ?? null,
                color: existing?.color ?? "#FFFFFF",
              }
            : slot,
        ),
      );
    }
    setEditor(null);
    setError(null);
  }

  function deleteEditor() {
    if (!editor || editor.mode !== "edit" || !onChange) return;
    onChange(slots.filter((slot) => slot.key !== editor.key));
    setEditor(null);
    setError(null);
  }

  function closeEditor() {
    setEditor(null);
    setError(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-row flex-nowrap items-center gap-2 overflow-x-auto">
        <h2 className="shrink-0 text-small font-medium text-text-primary">相对时段</h2>
        {guide ? (
          <span className="inline-flex shrink-0 items-center rounded-md border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[11px] leading-none text-indigo-700/90 [white-space:nowrap] [word-break:keep-all]">
            {guide}
          </span>
        ) : null}
        <p className="ml-auto shrink-0 text-[11px] text-neutral-muted">
          {slots.length} / {limit}
        </p>
      </div>
      {error && !editor ? <p className="text-caption text-error">{error}</p> : null}
      <PlanRelativeCalendar
        periodKind={periodKind}
        slots={slots}
        readOnly={readOnly}
        onEmptyClick={readOnly ? undefined : openCreate}
        onSlotClick={readOnly ? undefined : openEdit}
      />
      {editor ? (
        <ModalDialog
          titleId={titleId}
          onClose={closeEditor}
          className="w-[min(20rem,calc(100vw-2rem))] max-h-[min(520px,calc(100vh-2rem))] overflow-y-auto rounded-xl border border-border-subtle bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        >
          {({ requestClose }) => (
            <div
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  // IME confirmation Enter must not save mid-composition (Safari keyCode 229).
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                  saveEditor();
                }
              }}
            >
              <h3 id={titleId} className="text-small font-medium text-text-primary">
                {editor.mode === "create" ? "添加时段" : "编辑时段"}
              </h3>
              <label className="mt-3 block space-y-1">
                <span className="text-caption text-neutral-muted">标题</span>
                <input
                  className={FIELD_CLASS}
                  value={editor.title}
                  onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                  placeholder="时段标题"
                  autoFocus
                />
              </label>
              <label className="mt-3 block space-y-1">
                <span className="text-caption text-neutral-muted">描述</span>
                <textarea
                  className={`${FIELD_CLASS} min-h-[64px] resize-y`}
                  value={editor.body}
                  onChange={(event) => setEditor({ ...editor, body: event.target.value })}
                  placeholder="时段说明"
                  rows={2}
                />
              </label>
              <label className="mt-3 block space-y-1">
                <span className="text-caption text-neutral-muted">地点</span>
                <input
                  className={FIELD_CLASS}
                  value={editor.location}
                  onChange={(event) => setEditor({ ...editor, location: event.target.value })}
                  placeholder="可选"
                />
              </label>
              <div className="mt-3 space-y-1">
                <span className="text-caption text-neutral-muted">优先级</span>
                <SystemSelect
                  label="优先级"
                  hideLabel
                  showAccent={false}
                  value={editor.priority}
                  options={PRIORITY_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  onChange={(priority) => setEditor({ ...editor, priority })}
                  placeholder="选择优先级"
                />
              </div>
              <label className="mt-3 flex items-center gap-2 text-small text-text-primary">
                <input
                  type="checkbox"
                  checked={editor.all_day}
                  onChange={(event) => setEditor({ ...editor, all_day: event.target.checked })}
                />
                全天
              </label>
              {!editor.all_day ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-caption text-neutral-muted">开始</span>
                    <input
                      className={FIELD_CLASS}
                      value={editor.startText}
                      onChange={(event) => setEditor({ ...editor, startText: event.target.value })}
                      placeholder="09:00"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-caption text-neutral-muted">结束</span>
                    <input
                      className={FIELD_CLASS}
                      value={editor.endText}
                      onChange={(event) => setEditor({ ...editor, endText: event.target.value })}
                      placeholder="10:00"
                    />
                  </label>
                </div>
              ) : null}
              {error ? <p className="mt-2 text-caption text-error">{error}</p> : null}
              <div className="mt-4 flex items-center justify-between gap-2">
                {editor.mode === "edit" ? (
                  <button
                    type="button"
                    className="rounded-xl px-3 py-1.5 text-small text-error hover:bg-error-container/10"
                    onClick={deleteEditor}
                  >
                    删除
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-xl px-3 py-1.5 text-small text-text-secondary hover:bg-gray-100"
                    onClick={requestClose}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="rounded-xl bg-primary px-3 py-1.5 text-small text-on-primary"
                    onClick={saveEditor}
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          )}
        </ModalDialog>
      ) : null}
    </div>
  );
}
