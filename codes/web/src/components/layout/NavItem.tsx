"use client";

import Link from "next/link";

export type NavItemProps = {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  inset?: boolean;
  collapsed?: boolean;
  hidden?: boolean;
};

export function NavItem({ href, icon, label, active, inset, collapsed, hidden }: NavItemProps) {
  const layoutClass = collapsed
    ? "justify-center px-2"
    : `gap-3 ${inset ? "pl-10 pr-3" : "px-3"}`;

  return (
    <Link
      className={
        active
          ? `flex items-center ${layoutClass} py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors font-medium text-sm${hidden ? " hidden" : ""}`
          : `flex items-center ${layoutClass} py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors font-medium text-sm${hidden ? " hidden" : ""}`
      }
      href={href}
      title={collapsed ? label : undefined}
    >
      <span
        className="material-symbols-outlined flex h-6 w-6 shrink-0 items-center justify-center text-indigo-600"
        style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      {!collapsed && label}
    </Link>
  );
}
