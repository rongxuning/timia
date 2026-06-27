import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { formatScheduleDateTime, pad2 } from "./taskUtils";

export const DAY_TIMELINE_HOUR_HEIGHT_PX = 48;
export const DAY_TIMELINE_HEIGHT_PX = 24 * DAY_TIMELINE_HOUR_HEIGHT_PX;
const MIN_BLOCK_HEIGHT_PX = 28;

export type DayTimelineBlock = {
  item: ScheduleTaskItem;
  lane: number;
  laneCount: number;
  topPx: number;
  heightPx: number;
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

function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function minutesFromDayStart(ms: number, anchorKey: string): number {
  const [y, m, d] = anchorKey.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  return Math.max(0, Math.min(24 * 60, (ms - dayStart) / 60000));
}

function itemCrossesDay(it: ScheduleTaskItem, anchorKey: string, startMs: number, endMs: number): boolean {
  if (!it.start_at) return false;
  const start = new Date(it.start_at);
  const end = it.end_at ? new Date(it.end_at) : start;
  const taskStartKey = dateKeyLocal(start);
  const taskEndKey = dateKeyLocal(end);
  if (taskStartKey !== taskEndKey) return true;
  const { startMs: dayStart, endMs: dayEnd } = dayBounds(anchorKey);
  return start.getTime() < dayStart || end.getTime() > dayEnd;
}

type RawBlock = {
  item: ScheduleTaskItem;
  topPx: number;
  heightPx: number;
  startMin: number;
  endMin: number;
  crossesDay: boolean;
  startLabel: string;
  endLabel: string;
};

export function layoutDayTimeline(items: ScheduleTaskItem[], anchorKey: string): DayTimelineBlock[] {
  const { startMs: dayStart, endMs: dayEnd } = dayBounds(anchorKey);
  const raw: RawBlock[] = [];

  for (const item of items) {
    if (!item.start_at) continue;
    const start = new Date(item.start_at);
    const end = item.end_at ? new Date(item.end_at) : start;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const visibleStartMs = Math.max(start.getTime(), dayStart);
    const visibleEndMs = Math.min(end.getTime(), dayEnd);
    if (visibleEndMs < visibleStartMs) continue;

    const startMin = minutesFromDayStart(visibleStartMs, anchorKey);
    let endMin = minutesFromDayStart(visibleEndMs, anchorKey);
    if (endMin <= startMin) endMin = Math.min(startMin + 15, 24 * 60);
    const topPx = (startMin / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX;
    const heightPx = Math.max(MIN_BLOCK_HEIGHT_PX, ((endMin - startMin) / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX);

    raw.push({
      item,
      topPx,
      heightPx,
      startMin,
      endMin,
      crossesDay: itemCrossesDay(item, anchorKey, start.getTime(), end.getTime()),
      startLabel: formatScheduleDateTime(item.start_at) ?? "—",
      endLabel: formatScheduleDateTime(item.end_at ?? item.start_at) ?? "—",
    });
  }

  raw.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const lanes: Array<Array<{ startMin: number; endMin: number }>> = [];
  const placed: DayTimelineBlock[] = [];

  for (const block of raw) {
    let laneIdx = 0;
    while (true) {
      const lane = lanes[laneIdx] ?? [];
      const conflict = lane.some((x) => !(block.endMin <= x.startMin || block.startMin >= x.endMin));
      if (!conflict) {
        if (!lanes[laneIdx]) lanes[laneIdx] = [];
        lanes[laneIdx].push({ startMin: block.startMin, endMin: block.endMin });
        placed.push({
          item: block.item,
          lane: laneIdx,
          laneCount: 1,
          topPx: block.topPx,
          heightPx: block.heightPx,
          crossesDay: block.crossesDay,
          startLabel: block.startLabel,
          endLabel: block.endLabel,
        });
        break;
      }
      laneIdx += 1;
    }
  }

  const maxLane = placed.reduce((m, b) => Math.max(m, b.lane), 0);
  const laneCount = maxLane + 1;
  return placed.map((b) => ({ ...b, laneCount }));
}
