"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCurrentMe } from "@/lib/use-current-me";
import { isSystemAdmin } from "@/lib/system-role";
import { NavItem } from "./NavItem";

export function SideNav() {
  const pathname = usePathname();
  const me = useCurrentMe();
  const t = useTranslations("nav");
  const isAdmin = isSystemAdmin(me?.system_role);
  const userInitial = (me?.display_name?.trim().slice(0, 1) ?? "?").toUpperCase();
  return (
    <aside className="relative z-40 hidden h-full w-16 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
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
            label={t("schedule")}
            active={pathname.startsWith("/my/schedule")}
          />
          <NavItem
            href="/workspaces"
            icon="grid_view"
            label={t("workspaces")}
            active={pathname === "/workspaces" || pathname.startsWith("/workspace/")}
          />
          <NavItem
            href="/my/health"
            icon="monitor_heart"
            label={t("health")}
            active={pathname.startsWith("/my/health")}
          />
          <NavItem
            href="/plans"
            icon="calendar_month"
            label={t("plans")}
            active={pathname.startsWith("/plans")}
          />
          <NavItem
            href="/my/analytics"
            icon="query_stats"
            label={t("analytics")}
            active={pathname.startsWith("/my/analytics")}
          />
          <NavItem
            href="/member"
            icon="group"
            label={t("members")}
            active={pathname.startsWith("/member")}
            hidden={!isAdmin}
          />
          <NavItem
            href="/documents/code"
            icon="code"
            label={t("codeDocs")}
            active={pathname.startsWith("/documents/code")}
            hidden={!isAdmin}
          />
          <NavItem
            href="/documents/guide"
            icon="menu_book"
            label={t("guide")}
            active={pathname.startsWith("/documents/guide")}
            hidden={!isAdmin}
          />
          <NavItem
            href="/settings/llm-keys"
            icon="key"
            label={t("llmKeys")}
            active={pathname.startsWith("/settings/llm-keys")}
            hidden={!isAdmin}
          />
        </nav>
      </div>

      <div className="shrink-0 border-t border-gray-200 px-2 py-3">
        <Link
          href="/my/account"
          aria-label={t("account")}
          aria-current={pathname.startsWith("/my/account") ? "page" : undefined}
          className={[
            "group relative flex w-full items-center justify-center rounded-md px-2 py-2 transition-colors",
            pathname.startsWith("/my/account")
              ? "bg-indigo-50 text-indigo-700"
              : "text-gray-600 hover:bg-gray-100",
          ].join(" ")}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-900">
            {userInitial}
          </span>
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {t("account")}
          </span>
        </Link>
      </div>
    </aside>
  );
}
