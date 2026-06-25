import { apiFetch } from "@/lib/api";

export type WorkspaceOption = {
  id: string;
  name: string;
  description?: string | null;
};

export type ProjectOption = {
  id: string;
  name: string;
  description?: string | null;
};

export function fetchMyWorkspaces(token: string): Promise<WorkspaceOption[]> {
  return apiFetch<WorkspaceOption[]>("/workspaces", { token });
}

export function fetchMyProjects(token: string, workspaceId: string): Promise<ProjectOption[]> {
  return apiFetch<ProjectOption[]>(`/workspaces/${workspaceId}/projects`, { token });
}
