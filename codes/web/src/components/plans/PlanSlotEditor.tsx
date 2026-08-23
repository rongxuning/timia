"use client";

import { useEffect, useId, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { PRIORITY_OPTIONS } from "@/components/schedule/taskUtils";
import { SystemSelect } from "@/components/SystemSelect";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
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

type PopoverState = {
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
  left: number;
  top: number;
};

const POPOVER_WIDTH = 288;
const POPOVER_HEIGHT = 520;

function clampPopover(x: number, y: number) {
  if (typeof window === "undefined") return { left: x, top: y };
  const left = Math.min(Math.max(8, x), window.innerWidth - POPOVER_WIDTH - 8);
  const top = Math.min(Math.max(8, y + 8), window.innerHeight - POPOVER_HEIGHT - 8);
  return { left, top };
}

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
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEscapeDismiss({
    open: !!popover,
    onDismiss: () => {
      setPopover(null);
      setError(null);
    },
  });

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
    const pos = clampPopover(coords.clientX, coords.clientY);
    setError(null);
    setPopover({
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
      ...pos,
    });
  }

  function openEdit(slot: PlanSlotDraft, event: MouseEvent) {
    if (readOnly) return;
    const pos = clampPopover(event.clientX, event.clientY);
    setError(null);
    setPopover({
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
      ...pos,
    });
  }

  function savePopover() {
    if (!popover || !onChange) return;
    const title = popover.title.trim();
    if (!title) {
      setError("请填写时段标题");
      return;
    }
    let start = 0;
    let end = 1440;
    if (!popover.all_day) {
      const parsedStart = parseMinutes(popover.startText);
      const parsedEnd = parseMinutes(popover.endText);
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
      key: popover.key,
      rel_month: popover.rel_month,
      rel_day: popover.rel_day,
      start_minute: start,
      end_minute: end,
      all_day: popover.all_day,
      title,
      body: popover.body.trim() || null,
      details: null,
      color: "#FFFFFF",
      priority: popover.priority || "1",
      location: popover.location.trim() || null,
      sort_index: 0,
    };
    if (popover.mode === "create") {
      if (slots.length >= limit) {
        setError(`最多 ${limit} 个时段`);
        return;
      }
      onChange([...slots, nextSlot]);
    } else {
      const existing = slots.find((slot) => slot.key === popover.key);
      onChange(
        slots.map((slot) =>
          slot.key === popover.key
            ? {
                ...nextSlot,
                details: existing?.details ?? null,
                color: existing?.color ?? "#FFFFFF",
              }
            : slot,
        ),
      );
    }
    setPopover(null);
    setError(null);
  }

  function deletePopover() {
    if (!popover || popover.mode !== "edit" || !onChange) return;
    onChange(slots.filter((slot) => slot.key !== popover.key));
    setPopover(null);
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
      {error && !popover ? (
        <p className="text-caption text-error">{error}</p>
      ) : null}
      <PlanRelativeCalendar
        periodKind={periodKind}
        slots={slots}
        readOnly={readOnly}
        onEmptyClick={readOnly ? undefined : openCreate}
        onSlotClick={readOnly ? undefined : openEdit}
      />
      {mounted && popover
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                className="absolute inset-0 bg-black/20"
                aria-label="关闭时段编辑"
                onClick={() => {
                  setPopover(null);
                  setError(null);
                }}
              />
              <div
                role="dialog"
                aria-labelledby={titleId}
                className="absolute w-72 max-h-[min(520px,calc(100vh-16px))] overflow-y-auto rounded-xl border border-border-subtle bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
                style={{ left: popover.left, top: popover.top }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    savePopover();
                  }
                }}
              >
                <h3 id={titleId} className="text-small font-medium text-text-primary">
                  {popover.mode === "create" ? "添加时段" : "编辑时段"}
                </h3>
                <label className="mt-3 block space-y-1">
                  <span className="text-caption text-neutral-muted">标题</span>
                  <input
                    className={FIELD_CLASS}
                    value={popover.title}
                    onChange={(event) => setPopover({ ...popover, title: event.target.value })}
                    placeholder="时段标题"
                    autoFocus
                  />
                </label>
                <label className="mt-3 block space-y-1">
                  <span className="text-caption text-neutral-muted">描述</span>
                  <textarea
                    className={`${FIELD_CLASS} min-h-[64px] resize-y`}
                    value={popover.body}
                    onChange={(event) => setPopover({ ...popover, body: event.target.value })}
                    placeholder="时段说明"
                    rows={2}
                  />
                </label>
                <label className="mt-3 block space-y-1">
                  <span className="text-caption text-neutral-muted">地点</span>
                  <input
                    className={FIELD_CLASS}
                    value={popover.location}
                    onChange={(event) => setPopover({ ...popover, location: event.target.value })}
                    placeholder="可选"
                  />
                </label>
                <div className="mt-3 space-y-1">
                  <span className="text-caption text-neutral-muted">优先级</span>
                  <SystemSelect
                    label="优先级"
                    hideLabel
                    showAccent={false}
                    value={popover.priority}
                    options={PRIORITY_OPTIONS.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    onChange={(priority) => setPopover({ ...popover, priority })}
                    placeholder="选择优先级"
                  />
                </div>
                <label className="mt-3 flex items-center gap-2 text-small text-text-primary">
                  <input
                    type="checkbox"
                    checked={popover.all_day}
                    onChange={(event) => setPopover({ ...popover, all_day: event.target.checked })}
                  />
                  全天
                </label>
                {!popover.all_day ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-caption text-neutral-muted">开始</span>
                      <input
                        className={FIELD_CLASS}
                        value={popover.startText}
                        onChange={(event) => setPopover({ ...popover, startText: event.target.value })}
                        placeholder="09:00"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-caption text-neutral-muted">结束</span>
                      <input
                        className={FIELD_CLASS}
                        value={popover.endText}
                        onChange={(event) => setPopover({ ...popover, endText: event.target.value })}
                        placeholder="10:00"
                      />
                    </label>
                  </div>
                ) : null}
                {error ? <p className="mt-2 text-caption text-error">{error}</p> : null}
                <div className="mt-4 flex items-center justify-between gap-2">
                  {popover.mode === "edit" ? (
                    <button
                      type="button"
                      className="rounded-xl px-3 py-1.5 text-small text-error hover:bg-error-container/10"
                      onClick={deletePopover}
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
                      onClick={() => {
                        setPopover(null);
                        setError(null);
                      }}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-primary px-3 py-1.5 text-small text-on-primary"
                      onClick={savePopover}
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
