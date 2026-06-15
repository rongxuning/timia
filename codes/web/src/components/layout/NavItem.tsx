"use client";

export type NavItemProps = {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  inset?: boolean;
};

export function NavItem({ href, icon, label, active, inset }: NavItemProps) {
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
        className="material-symbols-outlined text-indigo-600"
        style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
      >
        {icon}
      </span>
      {label}
    </a>
  );
}
