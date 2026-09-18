import type { ScheduleTaskItem, StatusKey } from "@/types/api/views/schedule";
import { taskCalendarColors, taskLabelStripeColor } from "@/components/schedule/taskUtils";

const STATUS_STROKE: Record<StatusKey, string> = {
  todo: "#a1a1aa",
  doing: "#4f46e5",
  done: "#10B981",
  archived: "#71717a",
};

export type ScheduleMapItem = ScheduleTaskItem & {
  location_lat: number;
  location_lng: number;
};

export type ScheduleMapViewData = {
  items: ScheduleMapItem[];
  total: number;
  truncated: boolean;
};

export type ScheduleMapFeatureProperties = {
  id: string;
  pinColor: string;
  strokeColor: string;
};

export type ScheduleMapFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: ScheduleMapFeatureProperties;
};

export type ScheduleMapFeatureCollection = {
  type: "FeatureCollection";
  features: ScheduleMapFeature[];
};

export function emptyScheduleMapCollection(): ScheduleMapFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

export function scheduleMapPinColor(item: Pick<ScheduleTaskItem, "color" | "priority">): string {
  return taskLabelStripeColor(item.color, taskCalendarColors(item.priority).border);
}

export function scheduleMapStrokeColor(status: string): string {
  if (status === "todo" || status === "doing" || status === "done" || status === "archived") {
    return STATUS_STROKE[status];
  }
  return STATUS_STROKE.todo;
}

export function buildScheduleMapCollection(items: ScheduleMapItem[]): ScheduleMapFeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [item.location_lng, item.location_lat] },
      properties: {
        id: item.id,
        pinColor: scheduleMapPinColor(item),
        strokeColor: scheduleMapStrokeColor(item.status),
      },
    })),
  };
}

export function itemsById(items: ScheduleMapItem[]): Map<string, ScheduleMapItem> {
  return new Map(items.map((item) => [item.id, item]));
}
