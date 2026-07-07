"use client";

import { useSyncExternalStore } from "react";
import { getMeClientSnapshot, getMeServerSnapshot, subscribeMe } from "@/lib/auth";

export function useCurrentMe() {
  return useSyncExternalStore(subscribeMe, getMeClientSnapshot, getMeServerSnapshot);
}
