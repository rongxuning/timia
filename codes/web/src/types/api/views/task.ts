export type TaskUserBrief = {
  id: string;
  display_name: string;
};

export type TaskDrawerMemberOption = {
  user_id: string;
  email: string;
  display_name: string;
};

export type TaskDrawerContextView = {
  workspace_id: string;
  workspace_name: string;
  project_id: string;
  project_name: string;
  current_user_id: string;
  current_user_display_name: string;
  member_options: TaskDrawerMemberOption[];
};

export type ItemDetailComment = {
  id: string;
  author_user_id: string;
  author_display_name: string;
  body: string;
  created_at: string;
  created_at_label: string;
  deleted_at?: string | null;
  parent_comment_id: string | null;
  completion_status: string;
  is_author: boolean;
};

export type ItemDetailView = {
  workspace_id: string;
  project_id: string;
  id: string;
  title: string;
  body?: string | null;
  status: string;
  priority?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  details?: string | null;
  version: number;
  created_by?: TaskUserBrief | null;
  assignee?: TaskUserBrief | null;
  participants?: TaskUserBrief[];
  location?: string | null;
  comments: ItemDetailComment[];
};
