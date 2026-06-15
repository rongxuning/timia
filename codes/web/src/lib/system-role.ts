export const SYSTEM_ROLE_ADMIN = "admin";
export const SYSTEM_ROLE_USER = "user";

export type MeWithSystemRole = {
  id: string;
  email: string;
  display_name: string;
  system_role: string;
};

export function isSystemAdmin(systemRole: string | undefined): boolean {
  return systemRole === SYSTEM_ROLE_ADMIN;
}

/** 仅系统管理员可访问的路由前缀 */
const ADMIN_ONLY_PREFIXES = ["/member", "/documents"];

export function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
