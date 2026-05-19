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

export type CalendarWeekSegment = {
  item: ScheduleTaskItem;
  colStart: number;
  colSpan: number;
  lane: number;
  roundLeft: boolean;
  roundRight: boolean;
};

export type CalendarWeek = {
  days: Array<{ date: Date; key: string; inMonth: boolean }>;
  segments: CalendarWeekSegment[];
};
