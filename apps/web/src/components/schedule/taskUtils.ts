import type { CalendarWeek, CalendarWeekSegment, PriorityKey, ScheduleTaskItem, StatusKey } from "./types";

export const MONTHS = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
] as const;

export const STATUSES: Array<{ key: StatusKey; label: string; dotClass: string; bgClass: string }> = [
  { key: "todo", label: "待办", dotClass: "bg-zinc-300", bgClass: "bg-white" },
  { key: "doing", label: "进行中", dotClass: "bg-indigo-600", bgClass: "bg-surface-container-low/30" },
  { key: "done", label: "已完成", dotClass: "bg-success", bgClass: "bg-white" },
  { key: "archived", label: "已归档", dotClass: "bg-zinc-400", bgClass: "bg-white" },
];

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function wholeDaysBetweenInclusive(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function localDayRangeFromItem(it: ScheduleTaskItem): { startKey: string; endKey: string } | null {
  if (!it.start_at) return null;
  const s = new Date(it.start_at);
  if (Number.isNaN(s.getTime())) return null;
  const e = it.end_at ? new Date(it.end_at) : s;
  if (Number.isNaN(e.getTime())) return null;
  const dayStart = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const dayEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  if (dayEnd.getTime() < dayStart.getTime()) {
    const k = dayKeyLocal(dayStart);
    return { startKey: k, endKey: k };
  }
  return { startKey: dayKeyLocal(dayStart), endKey: dayKeyLocal(dayEnd) };
}

export function taskCalendarColors(taskId: string): { bg: string; fg: string; border: string } {
  let h = 2166136261;
  for (let i = 0; i < taskId.length; i++) {
    h ^= taskId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  return {
    bg: `hsla(${hue}, 72%, 90%, 0.95)`,
    fg: `hsla(${hue}, 45%, 22%, 1)`,
    border: `hsla(${hue}, 58%, 42%, 1)`,
  };
}

export function normalizePriority(p?: string | null): PriorityKey {
  const v = (p ?? "").trim().toLowerCase();
  if (v === "1" || v === "2" || v === "3" || v === "4") return v;
  if (v === "low") return "2";
  if (v === "medium") return "3";
  if (v === "high") return "4";
  return "1";
}

export function priorityBadgeClass(p?: string | null) {
  const n = normalizePriority(p);
  if (n === "1") return "bg-blue-100 text-blue-700 ring-1 ring-blue-200";
  if (n === "2") return "bg-green-100 text-green-700 ring-1 ring-green-200";
  if (n === "3") return "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200";
  return "bg-red-100 text-red-700 ring-1 ring-red-200";
}

function formatMdHm(d: Date) {
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatScheduleRange(startIso?: string | null, endIso?: string | null) {
  if (!startIso || !endIso) return null;
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() < s.getTime()) return null;
  const sameDay =
    s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
  return sameDay ? `${formatMdHm(s)}–${pad2(e.getHours())}:${pad2(e.getMinutes())}` : `${formatMdHm(s)}–${formatMdHm(e)}`;
}

export function toLocalDatetimeInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function countdownTargetForItem(it: ScheduleTaskItem): Date | null {
  if (it.end_at) {
    const d = new Date(it.end_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (it.start_at) {
    const d = new Date(it.start_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function formatRemainDHM(targetMs: number, nowMs: number): { text: string; overdue: boolean } {
  const diff = targetMs - nowMs;
  const overdue = diff <= 0;
  const abs = Math.abs(diff);
  const totalMinutes = Math.floor(abs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (!overdue) {
    return { text: `剩余${days}日${hours}时${minutes}分`, overdue: false };
  }
  return { text: `已逾期${days}日${hours}时${minutes}分`, overdue: true };
}

export function buildCalendarWeeks(items: ScheduleTaskItem[], calendarMonth: Date): CalendarWeek[] {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const first = new Date(year, month, 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());

  const weeks: CalendarWeek[] = [];

  for (let w = 0; w < 5; w++) {
    const weekDays: Array<{ date: Date; key: string; inMonth: boolean }> = [];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d;
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + idx);
      weekDays.push({
        date,
        key: dayKeyLocal(date),
        inMonth: date.getMonth() === month,
      });
    }

    const weekFirst = startOfLocalDay(weekDays[0].date);
    const weekLast = startOfLocalDay(weekDays[6].date);

    type RawSeg = Omit<CalendarWeekSegment, "lane">;
    const rawSegments: RawSeg[] = [];

    for (const it of items) {
      const range = localDayRangeFromItem(it);
      if (!range || !it.start_at) continue;
      const s = new Date(it.start_at);
      const e = it.end_at ? new Date(it.end_at) : s;
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) continue;
      const taskStart = startOfLocalDay(s);
      const taskEnd = startOfLocalDay(e);
      if (taskEnd.getTime() < taskStart.getTime()) continue;
      if (taskEnd.getTime() < weekFirst.getTime() || taskStart.getTime() > weekLast.getTime()) continue;

      const segStart = taskStart.getTime() < weekFirst.getTime() ? weekFirst : taskStart;
      const segEnd = taskEnd.getTime() > weekLast.getTime() ? weekLast : taskEnd;
      if (segStart.getTime() > segEnd.getTime()) continue;

      const colStart = wholeDaysBetweenInclusive(segStart, weekFirst) + 1;
      const colSpan = wholeDaysBetweenInclusive(segEnd, segStart) + 1;

      rawSegments.push({
        item: it,
        colStart,
        colSpan,
        roundLeft: dayKeyLocal(segStart) === range.startKey,
        roundRight: dayKeyLocal(segEnd) === range.endKey,
      });
    }

    rawSegments.sort((a, b) => {
      if (a.colStart !== b.colStart) return a.colStart - b.colStart;
      return b.colSpan - a.colSpan;
    });

    const lanes: Array<Array<{ s: number; e: number }>> = [];
    const segments: CalendarWeekSegment[] = [];

    for (const raw of rawSegments) {
      const cs = raw.colStart;
      const ce = raw.colStart + raw.colSpan - 1;
      let placed = false;
      for (let lane = 0; lane < 24; lane++) {
        const occupied = lanes[lane] ?? [];
        const conflict = occupied.some((r) => !(r.e < cs || r.s > ce));
        if (!conflict) {
          if (!lanes[lane]) lanes[lane] = [];
          lanes[lane].push({ s: cs, e: ce });
          segments.push({ ...raw, lane });
          placed = true;
          break;
        }
      }
      if (!placed) {
        const lane = lanes.length;
        lanes[lane] = [{ s: cs, e: ce }];
        segments.push({ ...raw, lane });
      }
    }

    weeks.push({ days: weekDays, segments });
  }

  return weeks;
}

export function buildItemsByPriority(items: ScheduleTaskItem[]): Record<PriorityKey, ScheduleTaskItem[]> {
  const out: Record<PriorityKey, ScheduleTaskItem[]> = { "1": [], "2": [], "3": [], "4": [] };
  for (const it of items) {
    if (it.status === "done" || it.status === "archived") continue;
    out[normalizePriority(it.priority)].push(it);
  }
  for (const k of ["1", "2", "3", "4"] as const) {
    out[k].sort((a, b) => {
      const as = a.start_at ? new Date(a.start_at).getTime() : 0;
      const bs = b.start_at ? new Date(b.start_at).getTime() : 0;
      if (bs !== as) return bs - as;
      return (a.title || "").localeCompare(b.title || "");
    });
  }
  return out;
}
