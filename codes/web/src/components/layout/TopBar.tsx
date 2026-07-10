"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TimiaLogo } from "@/components/TimiaLogo";
import { clearToken } from "@/lib/auth";
import { useCurrentMe } from "@/lib/use-current-me";

export type TopBarProps = {
  userMenuOpen: boolean;
  onUserMenuOpenChange: (open: boolean) => void;
};

export function TopBar({ userMenuOpen, onUserMenuOpenChange }: TopBarProps) {
  const router = useRouter();
  const me = useCurrentMe();
  const userInitial = (me?.display_name?.trim().slice(0, 1) ?? "?").toUpperCase();

  return (
    <header className="z-50 flex h-[34px] shrink-0 items-center border-b border-gray-200 bg-white/80 px-3 backdrop-blur-md">
      <div className="flex w-full items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/my/schedule" className="flex items-center gap-1.5 md:hidden">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm">
              <TimiaLogo size={14} className="block shrink-0" />
            </div>
            <span className="font-display text-sm font-bold leading-none tracking-tight text-gray-900">Timia</span>
          </Link>
          <Breadcrumbs className="hidden min-w-0 sm:block md:pl-container-padding" />
        </div>

        <div id="timia-user-menu-top" className="relative md:hidden">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => onUserMenuOpenChange(!userMenuOpen)}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-900 transition-colors hover:bg-gray-50"
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
    </header>
  );
}
