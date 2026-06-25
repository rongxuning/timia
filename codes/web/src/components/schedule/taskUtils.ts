import type { PriorityKey, ScheduleTaskItem, StatusKey } from "@/types/api/views/schedule";

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

/** 与 priorityBadgeClass / PriorityQuadrants 一致的日历任务条配色 */
const PRIORITY_CALENDAR_COLORS: Record<PriorityKey, { bg: string; fg: string; border: string }> = {
  "1": { bg: "#dbeafe", fg: "#1d4ed8", border: "#3b82f6" },
  "2": { bg: "#dcfce7", fg: "#15803d", border: "#22c55e" },
  "3": { bg: "#fef9c3", fg: "#854d0e", border: "#eab308" },
  "4": { bg: "#fee2e2", fg: "#b91c1c", border: "#ef4444" },
};

export function taskCalendarColors(p?: string | null): { bg: string; fg: string; border: string } {
  return PRIORITY_CALENDAR_COLORS[normalizePriority(p)];
}

/** 日历任务条单行高度（px），与 gridAutoRows 一致 */
export const CALENDAR_LANE_HEIGHT_PX = 88;
export const CALENDAR_LANE_GAP_PX = 4;

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

export function formatScheduleDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatMdHm(d);
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

const MS_PER_DAY = 86_400_000;
const COUNTDOWN_GREEN_MIN_MS = 3 * MS_PER_DAY;
const COUNTDOWN_BLUE_MIN_MS = 7 * MS_PER_DAY;

/** 优先级象限倒计时徽章：按剩余时间段着色（与任务 priority 无关） */
export function countdownBadgeClass(targetMs: number, nowMs: number): string {
  const diff = targetMs - nowMs;
  if (diff <= 0) return "bg-red-100 text-red-700 ring-1 ring-red-200";
  if (diff > COUNTDOWN_BLUE_MIN_MS) return "bg-blue-100 text-blue-700 ring-1 ring-blue-200";
  if (diff > COUNTDOWN_GREEN_MIN_MS) return "bg-green-100 text-green-700 ring-1 ring-green-200";
  return "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200";
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
