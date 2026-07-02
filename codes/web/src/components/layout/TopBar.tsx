"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TimiaLogo } from "@/components/TimiaLogo";
import { clearToken } from "@/lib/auth";

export type TopBarProps = {
  userInitial: string;
  userMenuOpen: boolean;
  onUserMenuOpenChange: (open: boolean) => void;
};

export function TopBar({ userInitial, userMenuOpen, onUserMenuOpenChange }: TopBarProps) {
  const router = useRouter();
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  return (
    <header className="z-50 flex h-14 shrink-0 items-center border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md">
      <div className="flex w-full items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/my/schedule" className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white shadow-sm">
              <TimiaLogo size={20} className="block shrink-0" />
            </div>
            <span className="font-display text-lg font-bold leading-none tracking-tight text-gray-900">Timia</span>
          </Link>
          <Breadcrumbs className="hidden min-w-0 sm:block md:pl-container-padding" />
        </div>

        <div className="flex items-center gap-4">
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => onUserMenuOpenChange(!userMenuOpen)}
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
      </div>
    </header>
  );
}
