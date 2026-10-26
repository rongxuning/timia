"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";
import type { InboxResponse } from "@/types/notification";

export const NOTIFICATIONS_CHANGED = "timia:notifications-changed";

export function publishNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function useUnreadNotificationCount(): number {
  const pathname = usePathname();
  const me = useCurrentMe();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setCount(0);
      return;
    }
    try {
      const data = await apiFetch<InboxResponse>("/v1/inbox?limit=1", { token });
      setCount(data.unread_count ?? 0);
    } catch {
      /* The badge is best-effort and must not block navigation. */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [me?.id, pathname, refresh]);

  return count;
}
