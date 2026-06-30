import type { CalendarWeekView, ScheduleTaskItem } from "@/types/api/views/schedule";

/** 从周视图 segments 按天聚合任务（跨天任务会出现在所覆盖的每一天） */
export function weekItemsByDayKey(week: CalendarWeekView): Map<string, ScheduleTaskItem[]> {
  const byDay = new Map<string, Map<string, ScheduleTaskItem>>();
  for (const { key } of week.days) {
    byDay.set(key, new Map());
  }

  for (const seg of week.segments) {
    for (let col = seg.col_start; col < seg.col_start + seg.col_span; col++) {
      const day = week.days[col - 1];
      if (!day) continue;
      const dayMap = byDay.get(day.key);
      if (!dayMap || dayMap.has(seg.item.id)) continue;
      dayMap.set(seg.item.id, seg.item);
    }
  }

  const result = new Map<string, ScheduleTaskItem[]>();
  for (const [key, map] of byDay) {
    const items = Array.from(map.values());
    items.sort(
      (a, b) =>
        (a.start_at ? new Date(a.start_at).getTime() : 0) - (b.start_at ? new Date(b.start_at).getTime() : 0) ||
        (a.title ?? "").localeCompare(b.title ?? "", "zh-CN"),
    );
    result.set(key, items);
  }
  return result;
}
