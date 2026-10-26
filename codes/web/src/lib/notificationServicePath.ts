export function isNotificationServicePath(path: string): boolean {
  const pathname = path.split("?", 1)[0] ?? path;
  return (
    pathname === "/v1/inbox" ||
    pathname.startsWith("/v1/inbox/") ||
    pathname === "/v1/admin/scenarios" ||
    pathname.startsWith("/v1/admin/scenarios/") ||
    pathname === "/v1/admin/notifications" ||
    pathname.startsWith("/v1/admin/notifications/")
  );
}
