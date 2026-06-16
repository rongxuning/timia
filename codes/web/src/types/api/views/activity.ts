export type ActivityTimelineItem = {
  id: string;
  actor_user_id: string;
  actor_user_id_short: string;
  entity_type: string;
  entity_type_label: string;
  entity_id: string;
  entity_id_short: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  created_at_label: string;
};

export type WorkspaceActivityView = {
  workspace_id: string;
  name: string;
  description?: string | null;
  total_count: number;
  latest_at_label?: string | null;
  items: ActivityTimelineItem[];
};
