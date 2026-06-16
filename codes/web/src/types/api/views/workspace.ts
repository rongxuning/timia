export type MemberPreview = {
  id: string;
  display_name: string;
  email: string;
};

export type WorkspaceMembersSummary = {
  total: number;
  owner_count: number;
  member_count: number;
  owners_preview: MemberPreview[];
  members_preview: MemberPreview[];
};

export type WorkspaceStatsView = {
  project_count: number;
  total_task_count: number;
  todo_count: number;
  doing_count: number;
  done_count: number;
  archived_count: number;
  high_priority_count: number;
  health_percent: number | null;
};

export type WorkspaceProjectCard = {
  id: string;
  name: string;
  description?: string | null;
  can_manage: boolean;
  todo_doing: number;
  done_archived: number;
  progress_percent: number;
};

export type WorkspaceDashboardView = {
  workspace_id: string;
  name: string;
  description?: string | null;
  created_at?: string | null;
  created_by_display_name?: string | null;
  can_edit_workspace: boolean;
  current_user_id: string;
  members: WorkspaceMembersSummary;
  stats: WorkspaceStatsView;
  active_projects: WorkspaceProjectCard[];
  total_active_projects: number;
};

export type DiscussionViewItem = {
  id: string;
  body: string;
  created_at: string;
  created_at_exact_label: string;
  created_ago_label: string;
  author_user_id: string;
  author_display_name: string;
  is_reply: boolean;
  completion_status: string;
  is_author: boolean;
  project_id: string;
  project_name: string;
  item_id: string;
  item_title: string;
};

export type WorkspaceDiscussionsView = {
  items: DiscussionViewItem[];
  has_more: boolean;
};

export type WorkspaceCardView = {
  id: string;
  name: string;
  description?: string | null;
  project_count: number;
  todo_count: number;
  doing_count: number;
  done_count: number;
  archived_count: number;
  owners: Array<{ id: string; email: string; display_name: string; role: string; status: string }>;
  members: Array<{ id: string; email: string; display_name: string; role: string; status: string }>;
  my_workspace_role: string;
};
