import { apiFetch } from "@/lib/api";
import type {
  HealthCardDetail,
  HealthProfile,
  HealthWorkoutDetail,
  HealthWorkoutsPage,
  MyHealthView,
} from "@/types/api/views/health";

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

export function patchHealthProfile(
  token: string,
  payload: {
    sex?: "male" | "female" | null;
    age_years?: number | null;
    height_cm?: number | null;
    max_hr_bpm?: number | null;
  },
): Promise<HealthProfile> {
  return apiFetch<HealthProfile>("/health/profile", {
    token,
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type FetchHealthWorkoutsParams = {
  end?: string;
  days?: number;
};

export function fetchHealthCardDetail(
  token: string,
  metric: string,
  params: FetchMyHealthParams = {},
): Promise<HealthCardDetail> {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.range) query.set("range", String(params.range));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiFetch<HealthCardDetail>(`/views/me/health/cards/${metric}${suffix}`, { token });
}

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

export function fetchHealthWorkoutDetail(token: string, id: string): Promise<HealthWorkoutDetail> {
  return apiFetch<HealthWorkoutDetail>(`/views/me/health/workouts/${id}`, { token });
}
