import type { PlanImportedRunOut, PlanSubscribedSegmentOut } from "@/lib/api/plans";

export type SubscribedPeriodRow = {
  key: string;
  periodStart: string;
  subscribedAt: string;
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  items: PlanImportedRunOut["items"];
};

export function formatWorkspaceProjectLabel(workspaceName: string, projectName: string): string {
  if (workspaceName && projectName) return `${workspaceName} · ${projectName}`;
  if (workspaceName) return workspaceName;
  if (projectName) return projectName;
  return "—";
}

export function flattenSubscribedPeriodRows(segments: PlanSubscribedSegmentOut[]): SubscribedPeriodRow[] {
  const rows: SubscribedPeriodRow[] = [];
  for (const segment of segments) {
    for (const run of segment.runs ?? []) {
      if (!run.period_start) continue;
      rows.push({
        key: `${segment.started_at}-${run.period_start}-${run.applied_at ?? ""}`,
        periodStart: run.period_start,
        subscribedAt: segment.started_at,
        workspaceId: run.workspace_id,
        workspaceName: run.workspace_name ?? "",
        projectId: run.project_id,
        projectName: run.project_name ?? "",
        items: run.items ?? [],
      });
    }
  }
  return rows.sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}

export function planPeriodDetailHref(
  templateId: string,
  periodStart: string,
  workspaceId: string,
  projectId: string,
): string {
  const params = new URLSearchParams({
    period_start: periodStart,
    workspace_id: workspaceId,
    project_id: projectId,
  });
  return `/plans/${templateId}/period?${params.toString()}`;
}
