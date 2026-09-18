import type { StatusKey } from "@/types/api/views/schedule";

export const MAP_STATUS_KEYS = ["todo", "doing", "done", "archived"] as const;
export type MapStatusKey = (typeof MAP_STATUS_KEYS)[number];

export const DEFAULT_MAP_STATUSES: MapStatusKey[] = ["todo", "doing"];

export const SCHEDULE_BOARD_MODE_KEY = "timia.schedule.boardMode";
export type ScheduleBoardMode = "calendar" | "map";

export type ScheduleMapFilters = {
  statuses: MapStatusKey[];
  workspaceId: string | null;
  projectId: string | null;
};

export function defaultScheduleMapFilters(): ScheduleMapFilters {
  return {
    statuses: [...DEFAULT_MAP_STATUSES],
    workspaceId: null,
    projectId: null,
  };
}

export function isMapStatusKey(value: string): value is MapStatusKey {
  return (MAP_STATUS_KEYS as readonly string[]).includes(value);
}

export function toggleMapStatus(statuses: MapStatusKey[], key: MapStatusKey): MapStatusKey[] {
  if (statuses.includes(key)) {
    if (statuses.length <= 1) return statuses;
    return statuses.filter((status) => status !== key);
  }
  return [...statuses, key];
}

export function isProjectFilterEnabled(filters: Pick<ScheduleMapFilters, "workspaceId">): boolean {
  return filters.workspaceId != null && filters.workspaceId !== "";
}

export function setMapWorkspace(
  filters: ScheduleMapFilters,
  workspaceId: string | null,
): ScheduleMapFilters {
  return { ...filters, workspaceId: workspaceId || null, projectId: null };
}

export function setMapProject(filters: ScheduleMapFilters, projectId: string | null): ScheduleMapFilters {
  if (!isProjectFilterEnabled(filters)) {
    return { ...filters, projectId: null };
  }
  return { ...filters, projectId: projectId || null };
}

export function isDefaultMapFilters(filters: ScheduleMapFilters): boolean {
  if (filters.workspaceId || filters.projectId) return false;
  if (filters.statuses.length !== DEFAULT_MAP_STATUSES.length) return false;
  return DEFAULT_MAP_STATUSES.every((status) => filters.statuses.includes(status));
}

export function readScheduleBoardMode(): ScheduleBoardMode {
  if (typeof window === "undefined") return "calendar";
  try {
    return sessionStorage.getItem(SCHEDULE_BOARD_MODE_KEY) === "map" ? "map" : "calendar";
  } catch {
    return "calendar";
  }
}

export function writeScheduleBoardMode(mode: ScheduleBoardMode) {
  try {
    sessionStorage.setItem(SCHEDULE_BOARD_MODE_KEY, mode);
  } catch {
    /* ignore quota / private mode */
  }
}

export function asStatusQuery(statuses: MapStatusKey[]): StatusKey[] {
  return statuses;
}
