import type { PlanImportedRunOut, PlanSubscribedSegmentOut } from "@/lib/api/plans";

export type SubscribedPeriodRow = {
  key: string;
  periodStart: string;
  createdAt: string;
  status: string;
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
        key: `${segment.started_at}-${run.period_start}-${run.created_at ?? ""}-${run.status ?? ""}`,
        periodStart: run.period_start,
        createdAt: run.created_at,
        status: run.status ?? "applied",
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

export function formatSubscribedTaskLabel(
  status: string,
  items: PlanImportedRunOut["items"],
): string {
  if (status !== "applied") return "--";
  const titles = (items ?? []).map((item) => item.title).filter(Boolean);
  return titles.length > 0 ? titles.join("、") : "暂无任务";
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
