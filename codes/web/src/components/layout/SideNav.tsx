"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TimiaLogo } from "@/components/TimiaLogo";
import { NavItem } from "./NavItem";

export type SideNavProps = {
  isAdmin: boolean;
};

export function SideNav({ isAdmin }: SideNavProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-full w-48 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white md:flex">
      <div className="flex h-14 items-center justify-center px-4">
        <Link href="/my/schedule" className="inline-flex items-center gap-2.5">
          <TimiaLogo size={28} className="shrink-0" />
          <span className="font-display text-2xl font-bold leading-none tracking-tight text-gray-900">
            Timia
          </span>
        </Link>
      </div>
      <div className="flex flex-col space-y-2 p-4">
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
          {isAdmin && (
            <NavItem href="/member" icon="group" label="成员" active={pathname.startsWith("/member")} />
          )}
          <NavItem
            href="/my/analytics"
            icon="query_stats"
            label="数据分析"
            active={pathname.startsWith("/my/analytics")}
          />

          {isAdmin && (
            <div className="pt-1">
              <Link
                href="/documents"
                className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-all font-medium text-sm select-none"
              >
                <span className="material-symbols-outlined text-indigo-600">description</span>
                文档
              </Link>
              <div className="mt-1 space-y-1">
                <NavItem
                  href="/documents/code"
                  icon="code"
                  label="代码文档"
                  active={pathname.startsWith("/documents/code")}
                  inset
                />
                <NavItem
                  href="/documents/guide"
                  icon="menu_book"
                  label="使用指南"
                  active={pathname.startsWith("/documents/guide")}
                  inset
                />
              </div>
            </div>
          )}
        </nav>
      </div>
    </aside>
  );
}
