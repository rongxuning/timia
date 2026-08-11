import type { ScheduleTaskItem } from "@/types/api/views/schedule";

/** 日历落点：dateKey 是 YYYY-MM-DD；hour 是 0-23 的整点，null 表示"只改日期" */
export type CalendarDropTarget = {
  dateKey: string;
  hour: number | null;
};

export type ScheduleCalendarBodyProps = {
  onTaskClick: (it: ScheduleTaskItem) => void;
  onCompleteTask?: (itemId: string) => void;
  completingItemId?: string | null;
  showProjectContext?: boolean;
  /** 任务卡片状态勾选右侧展示负责人头像 */
  showAssigneeAvatar?: boolean;
  /** 点击日期空白区域时触发（dateKey 为 YYYY-MM-DD；日视图可带 hour） */
  onDateBlankClick?: (dateKey: string, hour?: number) => void;
  /** 点击日期数字格时跳转到对应日视图 */
  onDateHeaderClick?: (dateKey: string) => void;
  /** 拖拽中被拖任务的 id（全局共享，与 priority/swimlane 协同） */
  dragItemId?: string | null;
  /** 当前正在 hover 的日期格（dateKey），用于高亮落点 */
  dragOverDateKey?: string | null;
  /** 当前正在 hover 的小时槽（0-23），null=仅 hover 日期格 */
  dragOverHour?: number | null;
  /** 任务卡被拖起/拖结束时通知上层 */
  onDragItemIdChange?: (id: string | null) => void;
  /** hover 落点的日期格变化时回调 */
  onDragOverDateKeyChange?: (key: string | null) => void;
  /** hover 落点的小时槽变化时回调 */
  onDragOverHourChange?: (hour: number | null) => void;
  /** 任务卡拖到落点时触发（外部负责查找 item + PATCH + reloadAll） */
  onDropDateTime?: (taskId: string, target: CalendarDropTarget) => void;
  /** 当前正在改期的任务 id（用于锁定该条不被重复拖） */
  reschedulingItemId?: string | null;
};
