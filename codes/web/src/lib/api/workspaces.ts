import { apiFetch } from "@/lib/api";

export type WorkspaceOption = {
  id: string;
  name: string;
  description?: string | null;
  is_favorite: boolean;
  created_at: string;
};

export type ProjectOption = {
  id: string;
  name: string;
  description?: string | null;
  is_favorite: boolean;
  created_at: string;
};

function asWorkspaceOption(row: WorkspaceOption): WorkspaceOption {
  return {
    ...row,
    is_favorite: Boolean(row.is_favorite),
    created_at: row.created_at ?? "",
  };
}

function asProjectOption(row: ProjectOption): ProjectOption {
  return {
    ...row,
    is_favorite: Boolean(row.is_favorite),
    created_at: row.created_at ?? "",
  };
}

export function fetchMyWorkspaces(token: string): Promise<WorkspaceOption[]> {
  return apiFetch<WorkspaceOption[]>("/workspaces", { token }).then((rows) =>
    rows.map(asWorkspaceOption),
  );
}

export function fetchMyProjects(token: string, workspaceId: string): Promise<ProjectOption[]> {
  return apiFetch<ProjectOption[]>(`/workspaces/${workspaceId}/projects`, { token }).then((rows) =>
    rows.map(asProjectOption),
  );
}
