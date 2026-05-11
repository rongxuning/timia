"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NomiaLogoMark } from "@/components/NomiaLogoMark";

type MeResponse = { id: string; email: string; display_name: string };

function NavItem({
  href,
  icon,
  label,
  active,
  inset,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  inset?: boolean;
}) {
  return (
    <a
      className={
        active
          ? `flex items-center gap-3 ${inset ? "pl-10 pr-3" : "px-3"} py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-50 rounded-md transition-all font-medium text-sm`
          : `flex items-center gap-3 ${inset ? "pl-10 pr-3" : "px-3"} py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-all font-medium text-sm`
      }
      href={href}
    >
      <span
        className={active ? "material-symbols-outlined text-indigo-600" : "material-symbols-outlined text-indigo-600"}
        style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      {label}
    </a>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useMemo(() => getToken(), []);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    apiFetch<MeResponse>("/auth/me", { token })
      .then(setMe)
      .catch(() => setMe(null));
  }, [router, token]);

  useEffect(() => {
    if (!userMenuOpen) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [userMenuOpen]);

  const userInitial = (me?.display_name?.trim().slice(0, 1) ?? "?").toUpperCase();

  return (
    <div className="flex h-screen min-h-0 overflow-hidden">
      {/* SideNavBar：视口内固定，主区域单独滚动 */}
      <aside className="hidden h-full w-48 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white md:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/my/schedule" className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
              <NomiaLogoMark size={20} />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-gray-900">Nomia</span>
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
            <NavItem href="/member" icon="group" label="成员" active={pathname.startsWith("/member")} />
            <div className="pt-1">
              <div className="flex items-center gap-3 px-3 py-2 text-gray-600 rounded-md transition-all font-medium text-sm select-none">
                <span className="material-symbols-outlined text-indigo-600">query_stats</span>
                数据分析
              </div>
              <div className="mt-1 space-y-1">
                {/* reserved for future analytics pages */}
              </div>
            </div>

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
          </nav>
        </div>
      </aside>

      {/* 右侧：上为顶部工具栏，下为主区域（仅此区域滚动） */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="z-50 flex h-14 shrink-0 items-center border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md">
          <div className="flex w-full items-center justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {/* 小屏无侧栏时保留品牌识别 */}
              <Link href="/my/schedule" className="flex items-center gap-2 md:hidden">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
                  <NomiaLogoMark size={20} />
                </div>
                <span className="font-display text-lg font-bold tracking-tight text-gray-900">Nomia</span>
              </Link>
              <Breadcrumbs className="hidden min-w-0 sm:block md:pl-container-padding" />
            </div>

            <div className="flex items-center gap-4">
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  onClick={() => setUserMenuOpen((v) => !v)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-50"
                >
                  {userInitial}
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-32 rounded-xl border border-border-subtle bg-surface py-2 shadow-sm"
                  >
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-small text-text-secondary transition-colors hover:bg-surface-container-lowest"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false);
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
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

