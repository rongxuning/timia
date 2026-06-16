import { apiFetch } from "@/lib/api";
import type { WorkspaceActivityView } from "@/types/api/views/activity";
import type { WorkspaceMembersPageView } from "@/types/api/views/members";
import type { WorkspaceCardView, WorkspaceDashboardView, WorkspaceDiscussionsView } from "@/types/api/views/workspace";

export function fetchWorkspaceDashboard(token: string, workspaceId: string): Promise<WorkspaceDashboardView> {
  return apiFetch<WorkspaceDashboardView>(`/views/workspace/${workspaceId}/dashboard`, { token });
}

export type FetchWorkspaceDiscussionsParams = {
  limit?: number;
  offset?: number;
  incompleteOnly?: boolean;
  includeComments?: boolean;
  includeReplies?: boolean;
};

export function fetchWorkspaceDiscussions(
  token: string,
  workspaceId: string,
  params: FetchWorkspaceDiscussionsParams = {},
): Promise<WorkspaceDiscussionsView> {
  const q = new URLSearchParams();
  q.set("limit", String(params.limit ?? 20));
  q.set("offset", String(params.offset ?? 0));
  if (params.incompleteOnly) q.set("incomplete_only", "true");
  q.set("include_comments", params.includeComments === false ? "false" : "true");
  q.set("include_replies", params.includeReplies === false ? "false" : "true");
  return apiFetch<WorkspaceDiscussionsView>(`/views/workspace/${workspaceId}/discussions?${q}`, { token });
}

export function fetchWorkspaceCards(token: string): Promise<WorkspaceCardView[]> {
  return apiFetch<WorkspaceCardView[]>("/workspaces/cards", { token });
}

export function fetchWorkspaceActivity(token: string, workspaceId: string): Promise<WorkspaceActivityView> {
  return apiFetch<WorkspaceActivityView>(`/views/workspace/${workspaceId}/activity`, { token });
}

export function fetchWorkspaceMembersPage(token: string, workspaceId: string): Promise<WorkspaceMembersPageView> {
  return apiFetch<WorkspaceMembersPageView>(`/views/workspace/${workspaceId}/members-page`, { token });
}
