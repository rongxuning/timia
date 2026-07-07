"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearToken } from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";
import { isSystemAdmin } from "@/lib/system-role";
import { NavItem } from "./NavItem";

const SIDEBAR_COLLAPSED_KEY = "timia-sidebar-collapsed";
const SIDEBAR_EXPANDED_WIDTH_CLASS = "w-[168px]";

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
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true") {
      setCollapsed(true);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }

  return (
    <aside
      className={`hidden h-full shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-[width] duration-200 md:flex ${
        collapsed ? "w-16" : SIDEBAR_EXPANDED_WIDTH_CLASS
      }`}
    >
      <div className={collapsed ? "px-2" : "px-3"}>
        <div className={`flex h-14 w-full items-center ${collapsed ? "justify-center" : "gap-3 px-3"}`}>
          <button
            type="button"
            aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
            aria-expanded={!collapsed}
            onClick={toggleCollapsed}
            className="inline-flex shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100"
          >
            <span className="material-symbols-outlined text-[24px] leading-none">
              {collapsed ? "left_panel_open" : "left_panel_close"}
            </span>
          </button>
          {!collapsed && (
            <Link
              href="/my/schedule"
              className="min-w-0 truncate font-display text-2xl font-bold leading-none tracking-tight text-gray-900"
            >
              Timia
            </Link>
          )}
        </div>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-3"}`}>
        <nav className="space-y-1">
          <NavItem
            href="/my/schedule"
            icon="event_note"
            label="我的日程"
            active={pathname.startsWith("/my/schedule")}
            collapsed={collapsed}
          />
          <NavItem
            href="/workspaces"
            icon="grid_view"
            label="工作空间"
            active={pathname === "/workspaces" || pathname.startsWith("/workspace/")}
            collapsed={collapsed}
          />
          <NavItem
            href="/member"
            icon="group"
            label="成员"
            active={pathname.startsWith("/member")}
            collapsed={collapsed}
            hidden={!isAdmin}
          />
          <NavItem
            href="/my/analytics"
            icon="query_stats"
            label="数据分析"
            active={pathname.startsWith("/my/analytics")}
            collapsed={collapsed}
          />
          <NavItem
            href="/documents/code"
            icon="code"
            label="代码文档"
            active={pathname.startsWith("/documents/code")}
            collapsed={collapsed}
            hidden={!isAdmin}
          />
          <NavItem
            href="/documents/guide"
            icon="menu_book"
            label="使用指南"
            active={pathname.startsWith("/documents/guide")}
            collapsed={collapsed}
            hidden={!isAdmin}
          />
        </nav>
      </div>

      <div
        id="timia-user-menu-side"
        className={`shrink-0 border-t border-gray-200 ${collapsed ? "px-2 py-3" : "px-3 py-3"}`}
      >
        <div className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            title={collapsed ? displayName : undefined}
            onClick={() => onUserMenuOpenChange(!userMenuOpen)}
            className={`flex items-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 ${
              collapsed ? "w-full justify-center px-2 py-2" : "gap-3 px-3 py-2"
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-900">
              {userInitial}
            </span>
            {!collapsed && (
              <span className="min-w-0 truncate text-left text-sm font-medium text-gray-900">{displayName}</span>
            )}
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              className={`absolute bottom-full z-50 mb-2 w-32 rounded-xl border border-border-subtle bg-surface py-2 shadow-sm ${
                collapsed ? "left-1/2 -translate-x-1/2" : "left-0"
              }`}
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
