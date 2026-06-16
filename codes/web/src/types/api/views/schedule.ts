export type TaskUserBrief = {
  id: string;
  display_name: string;
};

export type ScheduleTaskItem = {
  id: string;
  title: string;
  body?: string | null;
  status: "todo" | "doing" | "done" | "archived" | string;
  priority?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: string | null;
  version: number;
  created_by?: TaskUserBrief | null;
  assignee?: TaskUserBrief | null;
  participants?: TaskUserBrief[];
  location?: string | null;
  workspace_id: string;
  workspace_name: string;
  project_id: string;
  project_name: string;
};

export type StatusKey = "todo" | "doing" | "done" | "archived";
export type PriorityKey = "1" | "2" | "3" | "4";

export type CalendarDayView = {
  key: string;
  day: number;
  in_month: boolean;
};

export type CalendarSegmentView = {
  item: ScheduleTaskItem;
  col_start: number;
  col_span: number;
  lane: number;
  round_left: boolean;
  round_right: boolean;
};

export type CalendarWeekView = {
  days: CalendarDayView[];
  segments: CalendarSegmentView[];
};

export type ScheduleCalendarView = {
  month: string;
  weeks: CalendarWeekView[];
};

export type ScheduleSwimlaneView = {
  columns: Record<StatusKey, ScheduleTaskItem[]>;
};

export type SchedulePriorityView = {
  quadrants: Record<PriorityKey, ScheduleTaskItem[]>;
};

export type ScheduleDashboardStats = {
  task_total: number;
  todo_count: number;
  doing_count: number;
  done_count: number;
  archived_count: number;
  health_percent: number | null;
};

export type MyScheduleDashboardView = ScheduleDashboardStats & {
  display_name: string;
  email: string;
  workspace_count: number;
  project_count: number;
};

export type ScheduleScope = "me" | "project";

export type ScheduleScopeParams = {
  scope: ScheduleScope;
  workspaceId?: string;
  projectId?: string;
};
