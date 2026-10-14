"use client";

import { useCurrentMe } from "@/lib/use-current-me";
import { normalizeWeekStart } from "@/lib/weekStart";

export function useAccountWeekStart() {
  const me = useCurrentMe();
  return normalizeWeekStart(me?.week_starts_on);
}
