export type InboxItem = {
  id: string;
  notification_id: string;
  title: string;
  body: string;
  sender_user_id: string | null;
  sender_display_name: string | null;
  link: string | null;
  scenario_key: string | null;
  read_at: string | null;
  created_at: string;
  push_status: string;
};

export type InboxResponse = {
  items: InboxItem[];
  unread_count: number;
};

export type NotificationScenario = {
  key: string;
  enabled: boolean;
  title_template: string;
  body_template: string;
  push_enabled: boolean;
};

export type NotificationAudienceType = "broadcast" | "user_ids" | "project_id" | "workspace_id";

export type NotificationTiming = "immediate" | "delay" | "scheduled";

export type NotificationCreated = {
  id: string;
  status: string;
  delivery_count: number;
  scenario_key: string | null;
};

export function isAppNotificationLink(link: string | null | undefined): link is string {
  return typeof link === "string" && link.startsWith("/") && !link.startsWith("//");
}
