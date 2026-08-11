import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { CALENDAR_TASK_CARD_HEIGHT_PX, formatScheduleDateTime, pad2 } from "./taskUtils.ts";

export const DAY_TIMELINE_HOUR_HEIGHT_PX = 96;
export const DAY_TIMELINE_HEIGHT_PX = 24 * DAY_TIMELINE_HOUR_HEIGHT_PX;
/** 极短 segment 的最小高度（防御性）；整卡最短高度由 CALENDAR_TASK_CARD_HEIGHT_PX 在渲染层保证 */
const MIN_SEGMENT_HEIGHT_PX = 18;

/** 日历日视图内的一个渲染片段：阶梯矩形的一个台阶 */
export type DayTimelineSegment = {
  topPx: number;
  heightPx: number;
  /** 0-100，列内 left 百分比 */
  leftPct: number;
  /** 0-100，列内 width 百分比 */
  widthPct: number;
};

/** 日历日视图内的一个任务块；一个 item 可能对应多个 segments（阶梯） */
export type DayTimelineBlock = {
  item: ScheduleTaskItem;
  segments: DayTimelineSegment[];
  crossesDay: boolean;
  startLabel: string;
  endLabel: string;
};

function dayBounds(anchorKey: string): { startMs: number; endMs: number } {
  const [y, m, d] = anchorKey.split("-").map(Number);
  const startMs = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  const endMs = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  return { startMs, endMs };
}

function nextDayStart(anchorKey: string): number {
  const [y, m, d] = anchorKey.split("-").map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).getTime();
}

/** 任务从当天开始前持续到次日零点，视为覆盖该日全天。 */
export function itemCoversWholeDay(item: ScheduleTaskItem, anchorKey: string): boolean {
  if (!item.start_at || !item.end_at) return false;
  const startMs = new Date(item.start_at).getTime();
  const endMs = new Date(item.end_at).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  const { startMs: dayStart } = dayBounds(anchorKey);
  // 日期时间控件精确到分钟，因此 23:59 也按覆盖至当天末尾处理。
  return startMs <= dayStart && endMs >= nextDayStart(anchorKey) - 60_000;
}

export function splitDayItems(items: ScheduleTaskItem[], anchorKey: string) {
  const allDayItems: ScheduleTaskItem[] = [];
  const timedItems: ScheduleTaskItem[] = [];
  const { startMs: dayStart } = dayBounds(anchorKey);
  const dayEnd = nextDayStart(anchorKey);

  for (const item of items) {
    const startMs = item.start_at ? new Date(item.start_at).getTime() : Number.NaN;
    const endMs = item.end_at ? new Date(item.end_at).getTime() : startMs;
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      // 后端按日期返回跨天任务；结束时间恰好为 00:00 时，不在次日重复展示。
      if (endMs <= dayStart || startMs >= dayEnd) continue;
    }
    (itemCoversWholeDay(item, anchorKey) ? allDayItems : timedItems).push(item);
  }

  return { allDayItems, timedItems };
}

function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function minutesFromDayStart(ms: number, anchorKey: string): number {
  const [y, m, d] = anchorKey.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  return Math.max(0, Math.min(24 * 60, (ms - dayStart) / 60000));
}

function itemCrossesDay(it: ScheduleTaskItem, anchorKey: string): boolean {
  if (!it.start_at) return false;
  const start = new Date(it.start_at);
  const end = it.end_at ? new Date(it.end_at) : start;
  const taskStartKey = dateKeyLocal(start);
  const taskEndKey = dateKeyLocal(end);
  if (taskStartKey !== taskEndKey) return true;
  const { startMs: dayStart, endMs: dayEnd } = dayBounds(anchorKey);
  return start.getTime() < dayStart || end.getTime() > dayEnd;
}

type VisibleItem = {
  item: ScheduleTaskItem;
  startMin: number;
  endMin: number;
  duration: number;
};

/**
 * 核心布局算法：sweep line + duration 比例分栏（方案 B）。
 *
 * 设计要点：
 * 1. 收集所有 task 的 start/end 时间点作为 breakpoints
 * 2. 在每两个相邻 breakpoint 之间的稳定区间内，找到所有 active 的任务
 * 3. active 任务按 startMin 升序（稳定 tiebreak：endMin 降序，更长的优先）
 *    横向分配 = duration / totalActiveDuration * 100%
 * 4. 每个任务在每个稳定区间内得到一个 segment，相邻位置相同的 segment 合并
 * 5. 一个任务可能产生多个 segment（阶梯），因为它的 left/width 会在
 *    "其他任务进/出"时发生变化
 */
function computeSegments(visible: VisibleItem[]): Map<string, DayTimelineSegment[]> {
  const byItemId = new Map<string, DayTimelineSegment[]>();
  if (visible.length === 0) return byItemId;

  // 1. breakpoints
  const breakpointsSet = new Set<number>();
  for (const v of visible) {
    breakpointsSet.add(v.startMin);
    breakpointsSet.add(v.endMin);
  }
  const breakpoints = Array.from(breakpointsSet).sort((a, b) => a - b);

  // 2. 遍历稳定区间
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const tStart = breakpoints[i];
    const tEnd = breakpoints[i + 1];
    if (tEnd <= tStart) continue;

    // active set：startMin <= tStart && endMin >= tEnd
    const active = visible.filter((v) => v.startMin <= tStart && v.endMin >= tEnd);
    if (active.length === 0) continue;

    const totalDuration = active.reduce((sum, v) => sum + v.duration, 0);
    // 稳定排序：startMin 升序；同 start 时 endMin 降序（长的优先）
    const sortedActive = [...active].sort(
      (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
    );

    let leftPct = 0;
    for (const v of sortedActive) {
      const widthPct =
        totalDuration > 0 ? (v.duration / totalDuration) * 100 : 100 / active.length;
      const segs = byItemId.get(v.item.id) ?? [];
      segs.push({
        topPx: (tStart / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX,
        heightPx: ((tEnd - tStart) / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX,
        leftPct,
        widthPct,
      });
      byItemId.set(v.item.id, segs);
      leftPct += widthPct;
    }
  }

  // 3. 合并相邻同位置的 segment（节省 DOM 节点）
  for (const [id, segs] of byItemId) {
    const merged: DayTimelineSegment[] = [];
    for (const seg of segs) {
      const last = merged[merged.length - 1];
      if (last && last.leftPct === seg.leftPct && last.widthPct === seg.widthPct) {
        last.heightPx += seg.heightPx;
      } else {
        merged.push({ ...seg });
      }
    }
    byItemId.set(id, merged);
  }

  return byItemId;
}

/** 防御性：如果某个 segment 计算出的 heightPx 太小，给个最小高度（不修改原数据语义） */
function ensureMinHeight(seg: DayTimelineSegment): DayTimelineSegment {
  return seg.heightPx < MIN_SEGMENT_HEIGHT_PX
    ? { ...seg, heightPx: MIN_SEGMENT_HEIGHT_PX }
    : seg;
}

export function layoutDayTimeline(items: ScheduleTaskItem[], anchorKey: string): DayTimelineBlock[] {
  const { startMs: dayStart, endMs: dayEnd } = dayBounds(anchorKey);

  const visible: VisibleItem[] = [];
  for (const item of items) {
    if (!item.start_at) continue;
    const start = new Date(item.start_at);
    const end = item.end_at ? new Date(item.end_at) : start;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const visibleStartMs = Math.max(start.getTime(), dayStart);
    const visibleEndMs = Math.min(end.getTime(), dayEnd);
    if (visibleEndMs <= visibleStartMs) continue;

    const startMin = minutesFromDayStart(visibleStartMs, anchorKey);
    let endMin = minutesFromDayStart(visibleEndMs, anchorKey);
    if (endMin <= startMin) endMin = Math.min(startMin + 15, 24 * 60);
    visible.push({
      item,
      startMin,
      endMin,
      duration: endMin - startMin,
    });
  }

  const segmentsByItemId = computeSegments(visible);

  return visible.map((v) => {
    const segs = (segmentsByItemId.get(v.item.id) ?? []).map(ensureMinHeight);
    return {
      item: v.item,
      segments: segs,
      crossesDay: itemCrossesDay(v.item, anchorKey),
      startLabel: formatScheduleDateTime(v.item.start_at) ?? "—",
      endLabel: formatScheduleDateTime(v.item.end_at ?? v.item.start_at) ?? "—",
    };
  });
}
