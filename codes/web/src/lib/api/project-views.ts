import { apiFetch } from "@/lib/api";
import type { ProjectDashboardView } from "@/types/api/views/project";
import type { ProjectMembersPageView } from "@/types/api/views/members";

export function fetchProjectDashboard(
  token: string,
  workspaceId: string,
  projectId: string,
): Promise<ProjectDashboardView> {
  return apiFetch<ProjectDashboardView>(
    `/views/workspace/${workspaceId}/projects/${projectId}/dashboard`,
    { token },
  );
}

export function fetchProjectMembersPage(
  token: string,
  workspaceId: string,
  projectId: string,
): Promise<ProjectMembersPageView> {
  return apiFetch<ProjectMembersPageView>(
    `/views/workspace/${workspaceId}/projects/${projectId}/members-page`,
    { token },
  );
}
