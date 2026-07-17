"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, type ApiError } from "@/lib/api";
import {
  getMeClientSnapshot,
  getToken,
  loginRedirectReasonWhenUnauthenticated,
  publishMe,
  redirectToLoginPage,
} from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";
import { isAdminOnlyPath, isSystemAdmin, type MeWithSystemRole } from "@/lib/system-role";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export type AppShellProps = {
  children: ReactNode;
};

let inflightMeFetch: Promise<void> | null = null;

function refreshMeIfNeeded() {
  if (getMeClientSnapshot()) return Promise.resolve();
  if (inflightMeFetch) return inflightMeFetch;

  const t = getToken();
  if (!t) return Promise.resolve();

  inflightMeFetch = apiFetch<MeWithSystemRole>("/auth/me", { token: t })
    .then((data) => {
      publishMe(data);
    })
    .catch((err: ApiError) => {
      if (err?.status === 401) {
        publishMe(null);
      }
    })
    .finally(() => {
      inflightMeFetch = null;
    });

  return inflightMeFetch;
}

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useCurrentMe();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const scrollContainer = contentScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }, [pathname]);

  useEffect(() => {
    if (!getToken()) {
      redirectToLoginPage({ reason: loginRedirectReasonWhenUnauthenticated() });
    }
  }, [pathname]);

  useEffect(() => {
    void refreshMeIfNeeded();
  }, []);

  const isAdmin = isSystemAdmin(me?.system_role);

  useEffect(() => {
    if (!me || isAdmin) return;
    if (isAdminOnlyPath(pathname)) {
      router.replace("/my/schedule");
    }
  }, [me, isAdmin, pathname, router]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const sideMenu = document.getElementById("timia-user-menu-side");
      const topMenu = document.getElementById("timia-user-menu-top");
      if ((sideMenu && sideMenu.contains(target)) || (topMenu && topMenu.contains(target))) {
        return;
      }
      setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [userMenuOpen]);

  return (
    <div className="flex h-screen min-h-0">
      <SideNav userMenuOpen={userMenuOpen} onUserMenuOpenChange={setUserMenuOpen} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar userMenuOpen={userMenuOpen} onUserMenuOpenChange={setUserMenuOpen} />
        <div ref={contentScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
