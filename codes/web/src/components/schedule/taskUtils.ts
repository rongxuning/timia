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

/**
 * 任务自定义颜色用于卡片左侧标签色条。
 * 白色是任务的默认值，直接显示会在白色卡片上消失，因此回退到当前视图的优先级边框色。
 */
export function taskLabelStripeColor(color: string | null | undefined, fallback: string): string {
  const normalized = color?.trim().toUpperCase();
  if (!normalized || normalized === "#FFFFFF" || !/^#[0-9A-F]{6}$/.test(normalized)) {
    return fallback;
  }
  return normalized;
}

/** 日历任务条单行高度（px），与 gridAutoRows 一致 */
export const CALENDAR_LANE_HEIGHT_PX = 64;
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

function formatHm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatMdHmDash(d: Date) {
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${formatHm(d)}`;
}

/** 日历任务卡片：同一天 hh:mm-hh:mm，跨天 mm-dd hh:mm-mm-dd hh:mm */
export function formatScheduleTimeRange(startIso?: string | null, endIso?: string | null): string | null {
  if (!startIso) return null;
  const s = new Date(startIso);
  if (Number.isNaN(s.getTime())) return null;
  const e = endIso ? new Date(endIso) : s;
  if (Number.isNaN(e.getTime())) return formatHm(s);

  const sameDay =
    s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();

  if (sameDay) return `${formatHm(s)}-${formatHm(e)}`;
  return `${formatMdHmDash(s)}-${formatMdHmDash(e)}`;
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

/** 日历空白处新建任务：默认 9:00–10:00；日视图可传 hour 为起点（1 小时时长） */
export function localDatetimeRangeFromDateKey(
  dateKey: string,
  hour?: number,
): { start: string; end: string } {
  const parts = dateKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    const now = new Date();
    const startH = hour ?? 9;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, 0, 0, 0);
    const end =
      hour !== undefined && startH >= 23
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0, 0)
        : new Date(start.getTime() + 60 * 60 * 1000);
    return {
      start: toLocalDatetimeInputValue(start.toISOString()),
      end: toLocalDatetimeInputValue(end.toISOString()),
    };
  }
  const [y, m, d] = parts;
  const startH = hour ?? 9;
  const start = new Date(y, m - 1, d, startH, 0, 0, 0);
  let end: Date;
  if (hour !== undefined) {
    end =
      startH >= 23
        ? new Date(y, m - 1, d, 23, 59, 0, 0)
        : new Date(y, m - 1, d, startH + 1, 0, 0, 0);
  } else {
    end = new Date(y, m - 1, d, 10, 0, 0, 0);
  }
  return {
    start: toLocalDatetimeInputValue(start.toISOString()),
    end: toLocalDatetimeInputValue(end.toISOString()),
  };
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

/**
 * 任务是否在当前 anchor 日覆盖整天（与 calendarDayLayout.itemCoversWholeDay 对齐）
 * - 必须同时有 start_at 和 end_at
 * - start_at 在当日 00:00 及之前；end_at 在次日 00:00 及之后（精度按分钟，允许 23:59 收尾）
 */
function itemCoversWholeDayLocal(item: ScheduleTaskItem, anchorKey: string): boolean {
  if (!item.start_at || !item.end_at) return false;
  const [y, m, d] = anchorKey.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const nextDayStart = new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime();
  const startMs = new Date(item.start_at).getTime();
  const endMs = new Date(item.end_at).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return startMs <= dayStart && endMs >= nextDayStart - 60_000;
}

/** 任务分类：calendar 里实际可见的只有"定时"和"全天"，"无 start_at"基本不出现（兜底用） */
export type CalendarItemKind = "timed" | "all-day" | "no-start";

export function classifyCalendarItem(item: ScheduleTaskItem, anchorKey: string): CalendarItemKind {
  if (!item.start_at) return "no-start";
  if (itemCoversWholeDayLocal(item, anchorKey)) return "all-day";
  return "timed";
}

export type RescheduleDropTarget = {
  /** 落点日期，YYYY-MM-DD（本地） */
  dateKey: string;
  /** 落点小时 0-23；null 表示"只改日期，保留原时分"（月视图日期格 / 周视图全天行） */
  hour: number | null;
};

/**
 * 给定原任务 + 落点，计算新的 start_at / end_at。
 * - 定时任务（timed）：保留 duration；dropHour=null 保留时分，dropHour=整数则 snap 到整点
 * - 全天任务（all-day）：保持整天；只改日期。dropHour=整数时拒绝（返回 null）
 * - 无 start_at（兜底）：dateKey+null → 09:00-10:00；dateKey+hour → 该整点起 1h
 *
 * 返回 ISO 字符串（与后端 ItemUpdate 一致），失败返回 null。
 */
export function computeRescheduledRange(
  item: ScheduleTaskItem,
  target: RescheduleDropTarget,
  anchorKey: string,
): { startAt: string; endAt: string | null } | null {
  const [y, m, d] = target.dateKey.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const kind = classifyCalendarItem(item, anchorKey);

  if (kind === "all-day") {
    if (target.hour != null) return null; // Q4: 全天任务不允许拖到小时槽
    // 保持整天
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d, 23, 59, 0, 0);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }

  if (kind === "no-start") {
    // Q2: 落到 09:00-10:00
    const startH = target.hour ?? 9;
    const start = new Date(y, m - 1, d, startH, 0, 0, 0);
    const end = target.hour != null
      ? new Date(y, m - 1, d, startH + 1, 0, 0, 0)
      : new Date(y, m - 1, d, 10, 0, 0, 0);
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  }

  // timed: 保留 duration，按"结束时间顺延"原话处理
  const origStart = new Date(item.start_at!);
  if (Number.isNaN(origStart.getTime())) return null;
  const origEnd = item.end_at ? new Date(item.end_at) : null;
  const hasOrigEnd = origEnd != null && !Number.isNaN(origEnd.getTime());
  const durationMs = hasOrigEnd ? origEnd!.getTime() - origStart.getTime() : 0;

  const startH = target.hour ?? origStart.getHours();
  const startMin = target.hour != null ? 0 : origStart.getMinutes();
  const start = new Date(y, m - 1, d, startH, startMin, 0, 0);

  // 计算 end：始终保留原 duration（包括跨日 duration）。
  // 不再做"拖到 23 点截 23:59"的截断——那是过度防御，会把跨日任务错误截成单日。
  let end: Date | null = null;
  if (durationMs > 0) {
    end = new Date(start.getTime() + durationMs);
  } else if (item.end_at && !hasOrigEnd) {
    // 原本 end_at 是无效值（防御性），保留 null
    end = null;
  }
  // 注意：即使 durationMs <= 0 也不返回 end 为 start 的相同值——这种情况实际不应发生
  return {
    startAt: start.toISOString(),
    endAt: end ? end.toISOString() : null,
  };
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
