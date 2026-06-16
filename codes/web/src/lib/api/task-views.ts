import { apiFetch } from "@/lib/api";
import type { ItemDetailView, TaskDrawerContextView } from "@/types/api/views/task";

export function fetchTaskDrawerContext(
  token: string,
  workspaceId: string,
  projectId: string,
): Promise<TaskDrawerContextView> {
  return apiFetch<TaskDrawerContextView>(
    `/views/workspace/${workspaceId}/projects/${projectId}/task-drawer-context`,
    { token },
  );
}

export function fetchItemDetail(
  token: string,
  workspaceId: string,
  projectId: string,
  itemId: string,
): Promise<ItemDetailView> {
  return apiFetch<ItemDetailView>(
    `/views/workspace/${workspaceId}/projects/${projectId}/items/${itemId}/detail`,
    { token },
  );
}
