import type { ScheduleTaskItem } from "@/types/api/views/schedule";

export type ScheduleCalendarBodyProps = {
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
  /** 点击日期空白区域时触发（dateKey 为 YYYY-MM-DD；日视图可带 hour） */
  onDateBlankClick?: (dateKey: string, hour?: number) => void;
  /** 点击日期数字格时跳转到对应日视图 */
  onDateHeaderClick?: (dateKey: string) => void;
};
