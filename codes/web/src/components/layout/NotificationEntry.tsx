"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useUnreadNotificationCount } from "@/lib/use-unread-notifications";

export function NotificationEntry({ variant }: { variant: "sidenav" | "topbar" }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const unread = useUnreadNotificationCount();
  const active = pathname.startsWith("/my/notifications");
  const showBadge = unread > 0;
  const badgeText = unread > 99 ? "99+" : String(unread);
  const label = showBadge ? t("badgeAria", { label: t("notifications"), count: unread }) : t("notifications");

  if (variant === "topbar") {
    return (
      <Link
        href="/my/notifications"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={[
          "relative flex h-6 w-6 items-center justify-center rounded-md md:hidden",
          active ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100",
        ].join(" ")}
      >
        <span className="material-symbols-outlined text-[18px] leading-none">notifications</span>
        {showBadge ? (
          <span className="pointer-events-none absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-semibold leading-none text-white">
            {badgeText}
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <Link
      href="/my/notifications"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={[
        "group relative flex w-full items-center justify-center rounded-md px-2 py-2 transition-colors",
        active ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100",
      ].join(" ")}
    >
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span
          className="material-symbols-outlined flex h-6 w-6 items-center justify-center text-indigo-600"
          style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          notifications
        </span>
        {showBadge ? (
          <span
            className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold leading-none tabular-nums text-white"
            aria-hidden
          >
            {badgeText}
          </span>
        ) : null}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {t("notifications")}
      </span>
    </Link>
  );
}
