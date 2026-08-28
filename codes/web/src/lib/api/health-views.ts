import { apiFetch } from "@/lib/api";
import type { HealthWorkoutsPage, MyHealthView } from "@/types/api/views/health";

export type FetchMyHealthParams = {
  date?: string;
  range?: number;
  month?: string;
};

export function fetchMyHealth(token: string, params: FetchMyHealthParams = {}): Promise<MyHealthView> {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.range) query.set("range", String(params.range));
  if (params.month) query.set("month", params.month);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<MyHealthView>(`/views/me/health${suffix}`, { token });
}

export function patchHealthLayout(token: string, cardOrder: string[]): Promise<{ card_order: string[] }> {
  return apiFetch<{ card_order: string[] }>("/health/layout", {
    token,
    method: "PATCH",
    body: JSON.stringify({ card_order: cardOrder }),
  });
}

export type FetchHealthWorkoutsParams = {
  end?: string;
  days?: number;
};

export function fetchHealthWorkouts(
  token: string,
  params: FetchHealthWorkoutsParams = {},
): Promise<HealthWorkoutsPage> {
  const query = new URLSearchParams();
  if (params.end) query.set("end", params.end);
  if (params.days) query.set("days", String(params.days));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<HealthWorkoutsPage>(`/views/me/health/workouts${suffix}`, { token });
}
