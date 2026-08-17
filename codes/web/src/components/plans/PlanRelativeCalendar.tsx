"use client";

import type { MouseEvent } from "react";
import {
  DAY_TIMELINE_HEIGHT_PX,
  DAY_TIMELINE_HOUR_HEIGHT_PX,
} from "@/components/schedule/calendarDayLayout";
import {
  calendarTaskSurfaceStyle,
  taskCalendarColors,
} from "@/components/schedule/taskUtils";
import {
  formatSlotRange,
  pad2,
  slotsForCell,
  type PlanPeriodKind,
  type PlanSlotDraft,
} from "./planSlots";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const;

export type PlanCalendarEmptyClick = {
  rel_month: number | null;
  rel_day: number;
  start_minute: number;
  all_day: boolean;
  clientX: number;
  clientY: number;
};

export type PlanRelativeCalendarProps = {
  periodKind: PlanPeriodKind;
  slots: PlanSlotDraft[];
  readOnly?: boolean;
  onEmptyClick?: (coords: PlanCalendarEmptyClick) => void;
  onSlotClick?: (slot: PlanSlotDraft, event: MouseEvent) => void;
};

function slotSurface(slot: PlanSlotDraft) {
  const custom = (slot.color || "").trim().toUpperCase();
  if (custom && custom !== "#FFFFFF") {
    return {
      backgroundColor: slot.color,
      color: "#1f2937",
      borderColor: slot.color,
    };
  }
  return calendarTaskSurfaceStyle(taskCalendarColors(slot.priority));
}

function HourLabels() {
  return (
    <div
      className="w-14 shrink-0 border-r border-border-subtle bg-surface-container-lowest/60"
      style={{ height: DAY_TIMELINE_HEIGHT_PX }}
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          className="relative border-b border-border-subtle/60 pr-1 text-right text-[10px] text-neutral-muted tabular-nums"
          style={{ height: DAY_TIMELINE_HOUR_HEIGHT_PX }}
        >
          <span className="absolute -top-2 right-1">{pad2(hour)}:00</span>
        </div>
      ))}
    </div>
  );
}

function TimedSlotBlock({
  slot,
  onSlotClick,
}: {
  slot: PlanSlotDraft;
  onSlotClick?: PlanRelativeCalendarProps["onSlotClick"];
}) {
  const top = (slot.start_minute / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX;
  const height = Math.max(
    18,
    ((slot.end_minute - slot.start_minute) / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX,
  );
  const colors = slotSurface(slot);
  return (
    <button
      type="button"
      data-slot-key={slot.key}
      className="absolute left-1 right-1 z-[1] overflow-hidden rounded-md border px-1 py-0.5 text-left text-[11px] leading-4"
      style={{ top, height, ...colors }}
      title={`${slot.title} · ${formatSlotRange(slot)}`}
      onClick={(event) => {
        event.stopPropagation();
        onSlotClick?.(slot, event);
      }}
    >
      <span className="block truncate font-medium">{slot.title || "未命名"}</span>
      {height >= 32 ? (
        <span className="block truncate opacity-80">{formatSlotRange(slot)}</span>
      ) : null}
    </button>
  );
}

function SlotChip({
  slot,
  onSlotClick,
}: {
  slot: PlanSlotDraft;
  onSlotClick?: PlanRelativeCalendarProps["onSlotClick"];
}) {
  const colors = slotSurface(slot);
  return (
    <button
      type="button"
      data-slot-key={slot.key}
      className="max-w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[10px] leading-4"
      style={colors}
      title={`${slot.title} · ${formatSlotRange(slot)}`}
      onClick={(event) => {
        event.stopPropagation();
        onSlotClick?.(slot, event);
      }}
    >
      {slot.title || "未命名"}
    </button>
  );
}

function handleTimelineClick(
  event: MouseEvent<HTMLElement>,
  relDay: number,
  onEmptyClick?: PlanRelativeCalendarProps["onEmptyClick"],
  readOnly?: boolean,
) {
  if (readOnly || !onEmptyClick) return;
  if ((event.target as HTMLElement).closest("[data-slot-key]")) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const y = event.clientY - rect.top;
  const hour = Math.min(23, Math.max(0, Math.floor(y / DAY_TIMELINE_HOUR_HEIGHT_PX)));
  onEmptyClick({
    rel_month: null,
    rel_day: relDay,
    start_minute: hour * 60,
    all_day: false,
    clientX: event.clientX,
    clientY: event.clientY,
  });
}

function handleAllDayClick(
  event: MouseEvent<HTMLElement>,
  relDay: number,
  onEmptyClick?: PlanRelativeCalendarProps["onEmptyClick"],
  readOnly?: boolean,
) {
  if (readOnly || !onEmptyClick) return;
  if ((event.target as HTMLElement).closest("[data-slot-key]")) return;
  onEmptyClick({
    rel_month: null,
    rel_day: relDay,
    start_minute: 0,
    all_day: true,
    clientX: event.clientX,
    clientY: event.clientY,
  });
}

function DayWeekCalendar({
  periodKind,
  slots,
  readOnly,
  onEmptyClick,
  onSlotClick,
}: PlanRelativeCalendarProps) {
  const days = periodKind === "week" ? 7 : 1;
  const emptyHint = readOnly ? "暂无时段" : "点击空白处添加时段";

  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <div className="flex border-b border-border-subtle">
        <div className="w-14 shrink-0 border-r border-border-subtle bg-surface" aria-hidden />
        <div className={`min-w-0 flex-1 ${days === 7 ? "grid grid-cols-7" : ""}`}>
          {Array.from({ length: days }, (_, relDay) => (
            <div
              key={relDay}
              className="min-h-7 px-1.5 py-1 text-center text-[11px] font-medium text-text-primary"
            >
              {days === 7 ? WEEKDAYS[relDay] : "当天"}
            </div>
          ))}
        </div>
      </div>
      <div className="flex border-b border-border-subtle bg-surface">
        <div className="flex w-14 shrink-0 items-start justify-end border-r border-border-subtle bg-surface-container-lowest/60 px-1 pt-2 text-[10px] text-neutral-muted">
          全天
        </div>
        <div className={`min-w-0 flex-1 ${days === 7 ? "grid grid-cols-7" : ""}`}>
          {Array.from({ length: days }, (_, relDay) => {
            const allDay = slotsForCell(slots, periodKind, relDay).filter((slot) => slot.all_day);
            return (
              <div
                key={relDay}
                className="min-h-9 cursor-pointer border-r border-border-subtle p-1 last:border-r-0"
                onClick={(event) => handleAllDayClick(event, relDay, onEmptyClick, readOnly)}
              >
                <div className="flex flex-wrap gap-1">
                  {allDay.map((slot) => (
                    <SlotChip key={slot.key} slot={slot} onSlotClick={onSlotClick} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <div className="flex bg-surface pt-2">
          <HourLabels />
          <div className={`min-w-0 flex-1 ${days === 7 ? "grid grid-cols-7" : ""}`}>
            {Array.from({ length: days }, (_, relDay) => {
              const timed = slotsForCell(slots, periodKind, relDay).filter((slot) => !slot.all_day);
              return (
                <div
                  key={relDay}
                  className="relative cursor-pointer border-r border-border-subtle last:border-r-0"
                  style={{ height: DAY_TIMELINE_HEIGHT_PX }}
                  onClick={(event) => handleTimelineClick(event, relDay, onEmptyClick, readOnly)}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div
                      key={hour}
                      className="border-b border-border-subtle/60"
                      style={{ height: DAY_TIMELINE_HOUR_HEIGHT_PX }}
                    />
                  ))}
                  {timed.map((slot) => (
                    <TimedSlotBlock key={slot.key} slot={slot} onSlotClick={onSlotClick} />
                  ))}
                  {timed.length === 0 && readOnly ? (
                    <p className="pointer-events-none absolute inset-x-2 top-2 text-[10px] text-neutral-muted">
                      {emptyHint}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {!readOnly ? (
        <p className="border-t border-border-subtle px-3 py-2 text-caption text-neutral-muted">
          {emptyHint}；同一相对日不跨午夜
        </p>
      ) : null}
    </div>
  );
}

function MonthYearCalendar({
  periodKind,
  slots,
  readOnly,
  onEmptyClick,
  onSlotClick,
}: PlanRelativeCalendarProps) {
  const months = periodKind === "year" ? 12 : 1;

  function handleCellClick(
    event: MouseEvent<HTMLElement>,
    relDay: number,
    relMonth: number | null,
  ) {
    if (readOnly || !onEmptyClick) return;
    if ((event.target as HTMLElement).closest("[data-slot-key]")) return;
    onEmptyClick({
      rel_month: relMonth,
      rel_day: relDay,
      start_minute: 0,
      all_day: true,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  return (
    <div className="space-y-4">
      <div
        className={
          periodKind === "year"
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            : ""
        }
      >
        {Array.from({ length: months }, (_, index) => {
          const relMonth = periodKind === "year" ? index + 1 : null;
          return (
            <div key={relMonth ?? "month"} className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
              {periodKind === "year" ? (
                <div className="border-b border-border-subtle px-3 py-2 text-small font-medium text-text-primary">
                  {relMonth}月
                </div>
              ) : null}
              <div className="grid grid-cols-7">
                {Array.from({ length: 31 }, (_, dayIndex) => {
                  const relDay = dayIndex + 1;
                  const cellSlots = slotsForCell(slots, periodKind, relDay, relMonth);
                  return (
                    <div
                      key={relDay}
                      className="min-h-[76px] cursor-pointer border-b border-r border-border-subtle p-1 last:border-r-0 hover:bg-primary/5"
                      onClick={(event) => handleCellClick(event, relDay, relMonth)}
                    >
                      <div className="text-[11px] font-medium leading-4 text-text-primary">{relDay}</div>
                      <div className="mt-1 flex flex-col gap-0.5">
                        {cellSlots.map((slot) => (
                          <SlotChip key={slot.key} slot={slot} onSlotClick={onSlotClick} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!readOnly ? (
        <p className="text-caption text-neutral-muted">点击空白格子添加时段；同一相对日不跨午夜</p>
      ) : null}
    </div>
  );
}

export function PlanRelativeCalendar(props: PlanRelativeCalendarProps) {
  if (props.periodKind === "month" || props.periodKind === "year") {
    return <MonthYearCalendar {...props} />;
  }
  return <DayWeekCalendar {...props} />;
}
