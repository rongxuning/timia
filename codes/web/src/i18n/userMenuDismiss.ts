export type UserMenuDismissProbe = {
  insideMenu: boolean;
  closestSelect?: boolean;
  missingTarget?: boolean;
};

export function shouldKeepUserMenuOpen(probe: UserMenuDismissProbe): boolean {
  if (probe.missingTarget) return false;
  if (probe.closestSelect) return true;
  return probe.insideMenu;
}

export function isUserMenuEventInside(
  target: EventTarget | null,
  menus: Array<ParentNode | null>,
): boolean {
  if (!(target instanceof Node)) {
    return shouldKeepUserMenuOpen({ insideMenu: false, missingTarget: true });
  }
  const closestSelect =
    target instanceof Element && Boolean(target.closest("select, option"));
  const insideMenu = menus.some((menu) => menu?.contains(target) ?? false);
  return shouldKeepUserMenuOpen({ insideMenu, closestSelect });
}
