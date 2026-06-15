export type MyAnalyticsView = {
  display_name: string;
  email: string;
  task_total: number;
  todo_count: number;
  doing_count: number;
  done_count: number;
  archived_count: number;
  high_priority_count: number;
  health_percent: number | null;
  workspace_count: number;
  project_count: number;
};
