"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getToken, loginRedirectReasonWhenUnauthenticated, redirectToLoginPage } from "@/lib/auth";
import { isAdminOnlyPath, isSystemAdmin, type MeWithSystemRole } from "@/lib/system-role";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [me, setMe] = useState<MeWithSystemRole | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      redirectToLoginPage({ reason: loginRedirectReasonWhenUnauthenticated() });
    }
  }, [pathname]);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    apiFetch<MeWithSystemRole>("/auth/me", { token: t })
      .then(setMe)
      .catch(() => setMe(null));
  }, [router]);

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
      const menu = document.getElementById("timia-user-menu-root");
      if (menu && !menu.contains(target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [userMenuOpen]);

  const userInitial = (me?.display_name?.trim().slice(0, 1) ?? "?").toUpperCase();

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      <SideNav isAdmin={isAdmin} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div id="timia-user-menu-root">
          <TopBar
            userInitial={userInitial}
            userMenuOpen={userMenuOpen}
            onUserMenuOpenChange={setUserMenuOpen}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
