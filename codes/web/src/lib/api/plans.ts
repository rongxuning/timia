import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api/generated";
import type { PlanFilterValues } from "@/components/plans/PlanFilters";

export type PlanTemplateCreate = components["schemas"]["PlanTemplateCreate"];
export type PlanTemplateUpdate = components["schemas"]["PlanTemplateUpdate"];
export type PlanTemplateOut = components["schemas"]["PlanTemplateOut"];
export type PlanSlotPut = components["schemas"]["PlanSlotPut"];
export type PlanSlotOut = components["schemas"]["PlanSlotOut"];
export type PlanApplyRequest = components["schemas"]["PlanApplyRequest"];
export type PlanApplyRunOut = components["schemas"]["PlanApplyRunOut"];
export type PlanSubscribeRequest = components["schemas"]["PlanSubscribeRequest"];
export type PlanSubscribeOut = components["schemas"]["PlanSubscribeOut"];
export type PlanConfirmRunOut = components["schemas"]["PlanConfirmRunOut"];
export type PlanCommentCreate = components["schemas"]["PlanCommentCreate"];
export type PlanCommentOut = components["schemas"]["PlanCommentOut"];
export type PlanListOut = components["schemas"]["PlanListOut"];
export type PlanCardOut = components["schemas"]["PlanCardOut"];
export type PlanDetailOut = components["schemas"]["PlanDetailOut"];
export type PlanImportedListOut = components["schemas"]["PlanImportedListOut"];
export type PlanImportedRowOut = components["schemas"]["PlanImportedRowOut"];
export type PlanImportedRunOut = components["schemas"]["PlanImportedRunOut"];
export type PlanRunItemOut = components["schemas"]["PlanRunItemOut"];
export type PlanSubscribedListOut = components["schemas"]["PlanSubscribedListOut"];
export type PlanSubscribedRowOut = components["schemas"]["PlanSubscribedRowOut"];
export type PlanPendingRunOut = components["schemas"]["PlanPendingRunOut"];
export type PlanNotificationListOut = components["schemas"]["PlanNotificationListOut"];
export type PlanNotificationOut = components["schemas"]["PlanNotificationOut"];
export type PlanFavoriteOut = { template_id: string; is_favorite: boolean };

export type FetchPlanListParams = {
  tab?: string;
  q?: string;
  visibility?: string;
  creator_q?: string;
  tag?: string[];
  period_kind?: string;
  usage_kind?: string;
  favorite?: boolean;
  limit?: number;
  offset?: number;
};

export type PlanPageParams = {
  q?: string;
  creator_q?: string;
  tag?: string[];
  period_kind?: string;
  usage_kind?: string;
  favorite?: boolean;
  limit?: number;
  offset?: number;
};

export function planFilterQueryParams(filters: PlanFilterValues): Omit<PlanPageParams, "limit" | "offset"> {
  return {
    q: filters.q.trim() || undefined,
    creator_q: filters.creator_q.trim() || undefined,
    period_kind: filters.period_kind || undefined,
    usage_kind: filters.usage_kind || undefined,
    tag: filters.tags.length > 0 ? filters.tags : undefined,
    favorite:
      filters.favorite === "true" ? true : filters.favorite === "false" ? false : undefined,
  };
}

function withQuery(
  path: string,
  params: Record<string, string | number | boolean | undefined | string[]>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null && item !== "") search.append(key, item);
      }
      continue;
    }
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export function fetchPlanList(
  token: string,
  params: FetchPlanListParams = {},
): Promise<PlanListOut> {
  return apiFetch<PlanListOut>(
    withQuery("/views/plans", {
      tab: params.tab,
      q: params.q,
      visibility: params.visibility,
      creator_q: params.creator_q,
      tag: params.tag,
      period_kind: params.period_kind,
      usage_kind: params.usage_kind,
      favorite: params.favorite,
      limit: params.limit,
      offset: params.offset,
    }),
    { token },
  );
}

export function fetchPlanDetail(token: string, planId: string): Promise<PlanDetailOut> {
  return apiFetch<PlanDetailOut>(`/views/plans/${planId}`, { token });
}

export function fetchImportedPlans(
  token: string,
  opts: PlanPageParams = {},
): Promise<PlanImportedListOut> {
  return apiFetch<PlanImportedListOut>(
    withQuery("/views/plans/imported", {
      q: opts.q,
      creator_q: opts.creator_q,
      tag: opts.tag,
      period_kind: opts.period_kind,
      usage_kind: opts.usage_kind,
      favorite: opts.favorite,
      limit: opts.limit,
      offset: opts.offset,
    }),
    { token },
  );
}

export function fetchSubscribedPlans(
  token: string,
  opts: PlanPageParams = {},
): Promise<PlanSubscribedListOut> {
  return apiFetch<PlanSubscribedListOut>(
    withQuery("/views/plans/subscribed", {
      q: opts.q,
      creator_q: opts.creator_q,
      tag: opts.tag,
      period_kind: opts.period_kind,
      usage_kind: opts.usage_kind,
      favorite: opts.favorite,
      limit: opts.limit,
      offset: opts.offset,
    }),
    { token },
  );
}

export function fetchPlanNotifications(
  token: string,
  opts: PlanPageParams = {},
): Promise<PlanNotificationListOut> {
  return apiFetch<PlanNotificationListOut>(
    withQuery("/views/plan-notifications", { limit: opts.limit, offset: opts.offset }),
    { token },
  );
}

export function createPlanTemplate(
  token: string,
  payload: PlanTemplateCreate,
): Promise<PlanTemplateOut> {
  return apiFetch<PlanTemplateOut>("/plan-templates", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function updatePlanTemplate(
  token: string,
  templateId: string,
  payload: PlanTemplateUpdate,
): Promise<PlanTemplateOut> {
  return apiFetch<PlanTemplateOut>(`/plan-templates/${templateId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload),
  });
}

export async function deletePlanTemplate(token: string, templateId: string): Promise<void> {
  await apiFetch<void>(`/plan-templates/${templateId}`, { method: "DELETE", token });
}

export function putPlanSlots(
  token: string,
  templateId: string,
  slots: PlanSlotPut[],
): Promise<PlanSlotOut[]> {
  return apiFetch<PlanSlotOut[]>(`/plan-templates/${templateId}/slots`, {
    method: "PUT",
    token,
    body: JSON.stringify(slots),
  });
}

export function applyPlan(
  token: string,
  templateId: string,
  payload: PlanApplyRequest,
): Promise<PlanApplyRunOut> {
  return apiFetch<PlanApplyRunOut>(`/plan-templates/${templateId}/apply`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export function subscribePlan(
  token: string,
  templateId: string,
  payload: PlanSubscribeRequest,
): Promise<PlanSubscribeOut> {
  return apiFetch<PlanSubscribeOut>(`/plan-templates/${templateId}/subscribe`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function cancelPlanSubscription(token: string, subscriptionId: string): Promise<void> {
  await apiFetch<void>(`/plan-subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    token,
  });
}

export function confirmPlanApplyRun(token: string, runId: string): Promise<PlanConfirmRunOut> {
  return apiFetch<PlanConfirmRunOut>(`/plan-apply-runs/${runId}/confirm`, {
    method: "POST",
    token,
  });
}

export function skipPlanApplyRun(token: string, runId: string): Promise<PlanApplyRunOut> {
  return apiFetch<PlanApplyRunOut>(`/plan-apply-runs/${runId}/skip`, {
    method: "POST",
    token,
  });
}

export function listPlanComments(token: string, templateId: string): Promise<PlanCommentOut[]> {
  return apiFetch<PlanCommentOut[]>(`/plan-templates/${templateId}/comments`, { token });
}

export function addPlanComment(
  token: string,
  templateId: string,
  payload: PlanCommentCreate,
): Promise<PlanCommentOut> {
  return apiFetch<PlanCommentOut>(`/plan-templates/${templateId}/comments`, {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}

export async function markPlanNotificationRead(
  token: string,
  notificationId: string,
): Promise<void> {
  await apiFetch<void>(`/plan-notifications/${notificationId}/read`, {
    method: "POST",
    token,
  });
}

export function updatePlanFavorite(
  token: string,
  templateId: string,
  isFavorite: boolean,
): Promise<PlanFavoriteOut> {
  return apiFetch<PlanFavoriteOut>(`/plan-templates/${templateId}/favorite`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ is_favorite: isFavorite }),
  });
}
