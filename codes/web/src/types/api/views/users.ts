export type UserDirectoryRow = {
  id: string;
  email: string;
  display_name: string;
  status: string;
  system_role: string;
  workspace_count: number;
  created_at?: string | null;
  created_at_label?: string | null;
};

export type UserDirectoryView = {
  user_total: number;
  users_with_workspace: number;
  unassigned_user_count: number;
  workspace_assignments_total: number;
  users: UserDirectoryRow[];
};

export type UserMembershipProject = {
  id: string;
  name: string;
  archived: boolean;
};

export type UserMembershipWorkspace = {
  workspace_id: string;
  workspace_name: string;
  membership_id: string;
  role: string;
  status: string;
  project_count: number;
  projects: UserMembershipProject[];
};

export type UserMembershipDetailView = {
  user_id: string;
  workspaces: UserMembershipWorkspace[];
};
