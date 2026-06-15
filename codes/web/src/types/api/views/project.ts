export type MemberAvatarPreview = {
  user_id: string;
  display_name: string;
  email: string;
  initial: string;
};

export type ProjectMembersSummary = {
  total: number;
  owner_count: number;
  member_count: number;
  owners_preview: MemberAvatarPreview[];
  members_preview: MemberAvatarPreview[];
};

export type ProjectScheduleStats = {
  task_total: number;
  todo_count: number;
  doing_count: number;
  done_count: number;
  archived_count: number;
  health_percent: number | null;
};

export type ProjectDashboardView = {
  workspace_id: string;
  workspace_name: string;
  project_id: string;
  name: string;
  description?: string | null;
  archived: boolean;
  can_manage: boolean;
  created_at?: string | null;
  created_at_label?: string | null;
  created_by_display_name?: string | null;
  members: ProjectMembersSummary;
  stats: ProjectScheduleStats;
};
