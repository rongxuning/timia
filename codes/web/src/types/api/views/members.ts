export type AssignableUser = {
  user_id: string;
  email: string;
  display_name: string;
};

export type MembershipRow = {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  status: string;
  is_creator?: boolean;
};

export type WorkspaceMembersPageView = {
  workspace_id: string;
  name: string;
  description?: string | null;
  created_by_user_id?: string | null;
  current_user_id: string;
  can_manage_workspace: boolean;
  members: MembershipRow[];
  assignable_users: AssignableUser[];
};

export type ProjectMembersPageView = {
  workspace_id: string;
  project_id: string;
  project_name: string;
  created_by_user_id?: string | null;
  can_manage_project: boolean;
  project_members: MembershipRow[];
  workspace_member_pool: AssignableUser[];
};
