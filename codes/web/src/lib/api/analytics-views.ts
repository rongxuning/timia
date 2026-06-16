import { apiFetch } from "@/lib/api";
import type { MyAnalyticsView } from "@/types/api/views/analytics";

export function fetchMyAnalytics(token: string): Promise<MyAnalyticsView> {
  return apiFetch<MyAnalyticsView>("/views/me/analytics", { token });
}
