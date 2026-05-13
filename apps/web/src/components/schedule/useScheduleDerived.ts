"use client";

import { useMemo } from "react";
import type { CalendarWeek, ScheduleTaskItem } from "./types";
import { buildCalendarWeeks, buildItemsByPriority } from "./taskUtils";

export function useCalendarWeeks(items: ScheduleTaskItem[], calendarMonth: Date): CalendarWeek[] {
  return useMemo(() => buildCalendarWeeks(items, calendarMonth), [items, calendarMonth]);
}

export function useItemsByPriority(items: ScheduleTaskItem[]) {
  return useMemo(() => buildItemsByPriority(items), [items]);
}
