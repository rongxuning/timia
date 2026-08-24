import type { PlanSlotOut, PlanSlotPut } from "@/lib/api/plans";

export const PLAN_SLOT_LIMITS = {
  day: 20,
  week: 50,
  month: 80,
  year: 100,
} as const;

export const PLAN_MAX_TAGS = 8;
export const PLAN_MAX_TAG_LEN = 20;

export type PlanPeriodKind = keyof typeof PLAN_SLOT_LIMITS;
export type PlanUsageKind = "plan_mode" | "subscription_mode";
export type PlanVisibility = "private" | "public";

export type PlanSlotDraft = {
  key: string;
  rel_month: number | null;
  rel_day: number;
  start_minute: number;
  end_minute: number;
  all_day: boolean;
  title: string;
  body: string | null;
  details: string | null;
  color: string;
  priority: string;
  location: string | null;
  sort_index: number;
};

export function isPlanPeriodKind(value: string): value is PlanPeriodKind {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

export function isPlanUsageKind(value: string): value is PlanUsageKind {
  return value === "plan_mode" || value === "subscription_mode";
}

export function slotLimit(periodKind: string): number {
  return isPlanPeriodKind(periodKind) ? PLAN_SLOT_LIMITS[periodKind] : 0;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.min(1440, minutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${pad2(h)}:${pad2(min)}`;
}

export function parseMinutes(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (mins < 0 || mins > 59) return null;
  if (hours === 24 && mins === 0) return 1440;
  if (hours < 0 || hours > 23) return null;
  return hours * 60 + mins;
}

export function formatSlotRange(slot: {
  all_day: boolean;
  start_minute: number;
  end_minute: number;
}): string {
  if (slot.all_day) return "全天";
  return `${formatMinutes(slot.start_minute)}–${formatMinutes(slot.end_minute)}`;
}

export function newSlotKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function slotOutToDraft(slot: PlanSlotOut): PlanSlotDraft {
  return {
    key: slot.id,
    rel_month: slot.rel_month,
    rel_day: slot.rel_day,
    start_minute: slot.start_minute,
    end_minute: slot.end_minute,
    all_day: slot.all_day,
    title: slot.title,
    body: slot.body,
    details: slot.details,
    color: slot.color,
    priority: slot.priority,
    location: slot.location,
    sort_index: slot.sort_index,
  };
}

export function draftsToPuts(slots: PlanSlotDraft[]): PlanSlotPut[] {
  return slots.map((slot, index) => ({
    rel_month: slot.rel_month,
    rel_day: slot.rel_day,
    start_minute: slot.all_day ? 0 : slot.start_minute,
    end_minute: slot.all_day ? 1440 : slot.end_minute,
    all_day: slot.all_day,
    title: slot.title,
    body: slot.body,
    details: slot.details,
    color: slot.color || "#FFFFFF",
    priority: slot.priority || "1",
    location: slot.location,
    sort_index: index,
  }));
}

export function validateSlotTimes(allDay: boolean, start: number, end: number): string | null {
  if (allDay) return null;
  if (!(start >= 0 && start < end && end <= 1440)) {
    return "结束时间必须晚于开始时间，且在当天 00:00–24:00 内";
  }
  return null;
}

export function defaultTimedRange(startMinute: number): { start_minute: number; end_minute: number } {
  const start = Math.max(0, Math.min(23 * 60, Math.floor(startMinute / 60) * 60));
  return { start_minute: start, end_minute: Math.min(1440, start + 60) };
}

export function slotsForCell(
  slots: PlanSlotDraft[],
  periodKind: PlanPeriodKind,
  relDay: number,
  relMonth: number | null = null,
): PlanSlotDraft[] {
  return slots.filter((slot) => {
    if (slot.rel_day !== relDay) return false;
    if (periodKind === "year") return slot.rel_month === relMonth;
    return slot.rel_month == null;
  });
}

export function putToDraft(slot: PlanSlotPut): PlanSlotDraft {
  return {
    key: newSlotKey(),
    rel_month: slot.rel_month ?? null,
    rel_day: slot.rel_day,
    start_minute: slot.start_minute,
    end_minute: slot.end_minute,
    all_day: slot.all_day,
    title: slot.title,
    body: slot.body ?? null,
    details: slot.details ?? null,
    color: slot.color || "#FFFFFF",
    priority: slot.priority || "1",
    location: slot.location ?? null,
    sort_index: slot.sort_index ?? 0,
  };
}

export type PlanSlotDraftStorage = {
  slots: PlanSlotPut[];
  error: string;
};

export function planSlotDraftStorageKey(templateId: string): string {
  return `timia-plan-slot-draft:${templateId}`;
}

export function savePlanSlotDraft(templateId: string, draft: PlanSlotDraftStorage): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(planSlotDraftStorageKey(templateId), JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

/** Load and remove a create-time slot draft for this template, if any. */
export function takePlanSlotDraft(templateId: string): PlanSlotDraftStorage | null {
  if (typeof sessionStorage === "undefined") return null;
  const key = planSlotDraftStorageKey(templateId);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as PlanSlotDraftStorage;
    if (!parsed || !Array.isArray(parsed.slots) || typeof parsed.error !== "string") {
      return null;
    }
    return parsed;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
}
