"use client";

import Link from "next/link";

export type NavItemProps = {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  hidden?: boolean;
};

export function NavItem({ href, icon, label, active, hidden }: NavItemProps) {
  return (
    <Link
      className={
        active
          ? `group relative flex items-center justify-center rounded-md bg-indigo-50 px-2 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50${hidden ? " hidden" : ""}`
          : `group relative flex items-center justify-center rounded-md px-2 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100${hidden ? " hidden" : ""}`
      }
      href={href}
      aria-label={label}
    >
      <span
        className="material-symbols-outlined flex h-6 w-6 shrink-0 items-center justify-center text-indigo-600"
        style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {label}
      </span>
    </Link>
  );
}
