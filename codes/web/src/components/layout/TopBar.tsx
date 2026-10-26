"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NotificationEntry } from "@/components/layout/NotificationEntry";
import { useCurrentMe } from "@/lib/use-current-me";

export function TopBar() {
  const pathname = usePathname();
  const me = useCurrentMe();
  const t = useTranslations("nav");
  const userInitial = (me?.display_name?.trim().slice(0, 1) ?? "?").toUpperCase();
  const onAccount = pathname.startsWith("/my/account");

  return (
    <header className="z-50 flex h-[34px] shrink-0 items-center border-b border-gray-200 bg-white/80 px-3 backdrop-blur-md">
      <div className="flex w-full items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/my/schedule" className="md:hidden">
            <span className="font-display text-sm font-bold leading-none tracking-tight text-gray-900">Timia</span>
          </Link>
          <Breadcrumbs className="hidden min-w-0 sm:block" />
        </div>

        <div className="flex items-center gap-1">
          <NotificationEntry variant="topbar" />
        <Link
          href="/my/account"
          aria-label={t("account")}
          aria-current={onAccount ? "page" : undefined}
          className={[
            "flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold text-gray-900 transition-colors md:hidden",
            onAccount
              ? "border-indigo-200 bg-indigo-50"
              : "border-gray-200 bg-white hover:bg-gray-50",
          ].join(" ")}
        >
          {userInitial}
        </Link>
        </div>
      </div>
    </header>
  );
}
