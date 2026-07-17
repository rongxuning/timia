"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";
import { isSystemAdmin } from "@/lib/system-role";
import { NavItem } from "./NavItem";

export type SideNavProps = {
  userMenuOpen: boolean;
  onUserMenuOpenChange: (open: boolean) => void;
};

export function SideNav({ userMenuOpen, onUserMenuOpenChange }: SideNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useCurrentMe();
  const isAdmin = isSystemAdmin(me?.system_role);
  const userInitial = (me?.display_name?.trim().slice(0, 1) ?? "?").toUpperCase();
  const displayName = me?.display_name?.trim() || "用户";

  return (
    <aside className="hidden h-full w-16 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
      <div className="px-2">
        <div className="flex h-14 w-full items-center justify-center">
          <Link
            href="/my/schedule"
            className="font-display text-sm font-bold leading-none tracking-tight text-gray-900"
          >
            Timia
          </Link>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-2">
        <nav className="space-y-1">
          <NavItem
            href="/my/schedule"
            icon="event_note"
            label="我的日程"
            active={pathname.startsWith("/my/schedule")}
          />
          <NavItem
            href="/workspaces"
            icon="grid_view"
            label="工作空间"
            active={pathname === "/workspaces" || pathname.startsWith("/workspace/")}
          />
          <NavItem
            href="/member"
            icon="group"
            label="成员"
            active={pathname.startsWith("/member")}
            hidden={!isAdmin}
          />
          <NavItem
            href="/my/analytics"
            icon="query_stats"
            label="数据分析"
            active={pathname.startsWith("/my/analytics")}
          />
          <NavItem
            href="/documents/code"
            icon="code"
            label="代码文档"
            active={pathname.startsWith("/documents/code")}
            hidden={!isAdmin}
          />
          <NavItem
            href="/documents/guide"
            icon="menu_book"
            label="使用指南"
            active={pathname.startsWith("/documents/guide")}
            hidden={!isAdmin}
          />
        </nav>
      </div>

      <div
        id="timia-user-menu-side"
        className="shrink-0 border-t border-gray-200 px-2 py-3"
      >
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            title={displayName}
            onClick={() => onUserMenuOpenChange(!userMenuOpen)}
            className="flex w-full items-center justify-center rounded-md px-2 py-2 text-gray-600 transition-colors hover:bg-gray-100"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-900">
              {userInitial}
            </span>
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              className="absolute bottom-0 left-full z-50 ml-2 w-32 rounded-xl border border-border-subtle bg-surface py-2 shadow-sm"
            >
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-small text-text-secondary transition-colors hover:bg-surface-container-lowest"
                role="menuitem"
                onClick={() => {
                  onUserMenuOpenChange(false);
                  clearToken();
                  router.push("/login");
                }}
              >
                退出登录
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
