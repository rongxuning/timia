"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch, bootstrapSession, type ApiError } from "@/lib/api";
import { useEscapeDismiss } from "@/hooks/useEscapeDismiss";
import {
  getMeClientSnapshot,
  getAccessToken,
  loginRedirectReasonWhenUnauthenticated,
  publishMe,
  redirectToLoginPage,
} from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";
import { isAdminOnlyPath, isSystemAdmin, type MeWithSystemRole } from "@/lib/system-role";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import { FloatingDraggableButton } from "@/components/FloatingDraggableButton";
import { StickyNoteModal } from "@/components/sticky-notes/StickyNoteModal";

export type AppShellProps = {
  children: ReactNode;
};

let inflightMeFetch: Promise<void> | null = null;

function refreshMeIfNeeded() {
  if (getMeClientSnapshot()) return Promise.resolve();
  if (inflightMeFetch) return inflightMeFetch;

  const t = getAccessToken();
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
  const [stickyNoteOpen, setStickyNoteOpen] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);

  useEscapeDismiss({
    open: userMenuOpen,
    onDismiss: () => setUserMenuOpen(false),
  });
  useEscapeDismiss({
    open: stickyNoteOpen,
    onDismiss: () => setStickyNoteOpen(false),
  });

  useLayoutEffect(() => {
    const scrollContainer = contentScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = 0;
    scrollContainer.scrollLeft = 0;
  }, [pathname]);

  // On mount, try to silently restore the session from the RT cookie. The AT
  // lives in memory only, so a hard refresh wipes it even when the cookie is
  // still valid. Without this, we'd bounce to /login on every F5.
  //
  // We gate `children` on `authReady` so that protected pages don't run their
  // mount-time token checks before bootstrap has had a chance to populate
  // the in-memory AT — otherwise they see `getToken() === null` and
  // `router.push("/login")` fires before our refresh lands.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await bootstrapSession();
      if (cancelled) return;
      if (!ok) {
        redirectToLoginPage({ reason: loginRedirectReasonWhenUnauthenticated() });
        return;
      }
      setAuthReady(true);
      void refreshMeIfNeeded();
    })();
    return () => {
      cancelled = true;
    };
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
          {authReady ? children : null}
        </div>
      </div>
      {authReady && me && (
        <>
          <FloatingDraggableButton
            ariaLabel="打开便利贴"
            onClick={() => setStickyNoteOpen(true)}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg"
              aria-hidden
            >
              <span className="material-icons text-[24px]">sticky_note_2</span>
            </span>
          </FloatingDraggableButton>
          <StickyNoteModal
            open={stickyNoteOpen}
            onClose={() => setStickyNoteOpen(false)}
          />
        </>
      )}
    </div>
  );
}
