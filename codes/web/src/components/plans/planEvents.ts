export const PLAN_BADGE_REFRESH_EVENT = "timia-plan-badge-refresh";

export function dispatchPlanBadgeRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PLAN_BADGE_REFRESH_EVENT));
}
