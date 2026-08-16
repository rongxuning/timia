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

export function isSettledCalendarStatus(status?: string | null): boolean {
  return status === "done" || status === "archived";
}

/** Completed calendar cards: keep hue, drop most saturation. */
export function desaturateHex(hex: string, amount = 0.72): string {
  const rgb = parseHexRgb(hex);
  if (!rgb) return hex;
  const clamped = clamp01(amount);
  if (clamped === 0) return `#${hex.trim().replace("#", "").toUpperCase()}`;
  const [hue, saturation, lightness] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const next = hslToRgb(hue, saturation * (1 - clamped), lightness);
  return rgbToHex(next[0], next[1], next[2]);
}

export const CALENDAR_COMPLETED_HATCH =
  "repeating-linear-gradient(-45deg, transparent 0 4px, rgba(107,114,128,0.28) 4px 6px)";

export function calendarTaskSurfaceStyle(
  colors: { bg: string; fg: string; border: string },
  status?: string | null,
): {
  backgroundColor: string;
  backgroundImage?: string;
  color: string;
  borderColor: string;
} {
  if (!isSettledCalendarStatus(status)) {
    return {
      backgroundColor: colors.bg,
      color: colors.fg,
      borderColor: colors.border,
    };
  }
  return {
    backgroundColor: desaturateHex(colors.bg),
    backgroundImage: CALENDAR_COMPLETED_HATCH,
    color: colors.fg,
    borderColor: colors.border,
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function parseHexRgb(hex: string): [number, number, number] | null {
  const value = hex.trim().replace("#", "");
  if (!/^[0-9A-Fa-f]{6}$/.test(value)) return null;
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel * 255)
      .toString(16)
      .padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  return [hue / 6, saturation, lightness];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hueToChannel = (p: number, q: number, t: number) => {
    let wrapped = t;
    if (wrapped < 0) wrapped += 1;
    if (wrapped > 1) wrapped -= 1;
    if (wrapped < 1 / 6) return p + (q - p) * 6 * wrapped;
    if (wrapped < 1 / 2) return q;
    if (wrapped < 2 / 3) return p + (q - p) * (2 / 3 - wrapped) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueToChannel(p, q, h + 1 / 3), hueToChannel(p, q, h), hueToChannel(p, q, h - 1 / 3)];
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

/** 日历任务卡片固定高度（px），月/周/日视图统一 */
export const CALENDAR_TASK_CARD_HEIGHT_PX = 72;
/** 日历任务条单行高度（px），与 gridAutoRows 一致 */
export const CALENDAR_LANE_HEIGHT_PX = CALENDAR_TASK_CARD_HEIGHT_PX;
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

/** 全站优先级展示文案（1→低 … 4→紧急）。 */
const PRIORITY_LABELS: Record<PriorityKey, string> = {
  "1": "低",
  "2": "中",
  "3": "高",
  "4": "紧急",
};

export function priorityLabel(p?: string | null): string {
  return PRIORITY_LABELS[normalizePriority(p)];
}

/** 优先级选项（任务抽屉 / 选择器共用）。 */
export const PRIORITY_OPTIONS: Array<{
  value: PriorityKey;
  label: string;
  hint: string;
  accentClass: string;
}> = [
  { value: "1", label: PRIORITY_LABELS["1"], hint: "低优先级", accentClass: "bg-blue-500" },
  { value: "2", label: PRIORITY_LABELS["2"], hint: "中优先级", accentClass: "bg-green-500" },
  { value: "3", label: PRIORITY_LABELS["3"], hint: "高优先级", accentClass: "bg-yellow-500" },
  { value: "4", label: PRIORITY_LABELS["4"], hint: "紧急优先级", accentClass: "bg-red-500" },
];

function formatMdHm(d: Date) {
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatHm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatMdHmDash(d: Date) {
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${formatHm(d)}`;
}

/**
 * 日历任务卡片时间范围：
 * - 同一天：`"09:00 - 10:30"`
 * - 跨天：`"08-15 09:00 - 08-17 10:30"`（自动在两端补日期）
 * - 缺 end_at：只显示开始时间，如 `"09:00"` 或 `"08-15 09:00"`
 */
export function formatScheduleTimeRange(startIso?: string | null, endIso?: string | null): string | null {
  if (!startIso) return null;
  const s = new Date(startIso);
  if (Number.isNaN(s.getTime())) return null;
  const e = endIso ? new Date(endIso) : null;
  const hasValidE = e != null && !Number.isNaN(e.getTime());

  // 缺结束时间：只渲染开始
  if (!hasValidE) {
    const startDateKey = formatDateAnchor(s);
    if (startDateKey === formatDateAnchor(new Date())) {
      // 当天：只显时间
      return formatHm(s);
    }
    return formatMdHmDash(s);
  }

  const sameDay =
    s.getFullYear() === e!.getFullYear() && s.getMonth() === e!.getMonth() && s.getDate() === e!.getDate();

  if (sameDay) return `${formatHm(s)} - ${formatHm(e!)}`;
  return `${formatMdHmDash(s)} - ${formatMdHmDash(e!)}`;
}

/** YYYY-MM-DD（与 calendarNav.formatDateAnchor 行为一致，但避免循环依赖） */
function formatDateAnchor(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

/** 拖拽最小颗粒度：15 分钟 */
export const SNAP_MINUTES = 15;
/** Default assumes day/week hour height 96; prefer passing hourHeight into snapYTo15Min. */
export const SNAP_MINUTES_PX = (SNAP_MINUTES / 60) * 96;

/**
 * 把鼠标 Y 坐标 snap 到 15 分钟整点，返回 float hour（0-24）。
 * 规则：round-to-nearest；Y < 0 视为 0，Y > 24h 视为 24。
 *
 * 用法：拖拽时把光标位置当成"卡片上边缘"用，所以 y 直接就是上边缘像素，
 * 转换出的 float hour 即为"该上边缘对应的时间"。
 */
export function snapYTo15Min(y: number, hourHeight = 96): number {
  const pxPerSnap = (SNAP_MINUTES / 60) * hourHeight;
  const totalMin = Math.round(y / pxPerSnap) * SNAP_MINUTES;
  return Math.max(0, Math.min(24, totalMin / 60));
}

/** float hour (0-24) 格式化为 "HH:MM"，如 10.5 → "10:30" */
export function formatFloatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${pad2(h)}:${pad2(m)}`;
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
 * 无时间任务拖到日历落点后的 start/end。
 * - hour 为 null（月视图日期格 / 周视图全天行）：当天 09:00–10:00，与空白处新建一致
 * - hour 为整点或 15 分钟 snap：从该时刻起 1 小时
 */
export function resolveUndatedDropRange(
  target: RescheduleDropTarget,
): { startAt: string; endAt: string } | null {
  const [y, m, d] = target.dateKey.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const startH = target.hour != null ? Math.floor(target.hour) : 9;
  const startM = target.hour != null ? Math.round((target.hour - startH) * 60) : 0;
  const start = new Date(y, m - 1, d, startH, startM, 0, 0);
  const end =
    target.hour != null
      ? new Date(y, m - 1, d, startH + 1, startM, 0, 0)
      : new Date(y, m - 1, d, 10, 0, 0, 0);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

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
    return resolveUndatedDropRange(target);
  }

  // timed: 保留 duration，按"结束时间顺延"原话处理
  const origStart = new Date(item.start_at!);
  if (Number.isNaN(origStart.getTime())) return null;
  const origEnd = item.end_at ? new Date(item.end_at) : null;
  const hasOrigEnd = origEnd != null && !Number.isNaN(origEnd.getTime());
  const durationMs = hasOrigEnd ? origEnd!.getTime() - origStart.getTime() : 0;

  // target.hour 为 null 时保留原时分；为 float 时拆出 hour+minute（15min snap）
  const startH = target.hour != null ? Math.floor(target.hour) : origStart.getHours();
  const startMin = target.hour != null ? Math.round((target.hour - startH) * 60) : origStart.getMinutes();
  const start = new Date(y, m - 1, d, startH, startMin, 0, 0);

  // 计算 end：始终保留原 duration（包括跨日 duration）。
  let end: Date | null = null;
  if (durationMs > 0) {
    end = new Date(start.getTime() + durationMs);
  } else if (item.end_at && !hasOrigEnd) {
    // 原本 end_at 是无效值（防御性），保留 null
    end = null;
  }
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
