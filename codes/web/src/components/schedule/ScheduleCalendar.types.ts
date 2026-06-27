import type { ScheduleTaskItem } from "@/types/api/views/schedule";

export type ScheduleCalendarBodyProps = {
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
};
