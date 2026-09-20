import type { Locale } from "./config";

export type ApplyLocaleChangeOptions = {
  current: Locale;
  next: Locale;
  persistCookie: (locale: Locale) => void;
  persistServer: (locale: Locale) => Promise<void>;
  closeOverlay: () => void;
  reload: () => void;
};

export async function applyLocaleChange({
  current,
  next,
  persistCookie,
  persistServer,
  closeOverlay,
  reload,
}: ApplyLocaleChangeOptions): Promise<void> {
  if (next === current) {
    closeOverlay();
    return;
  }
  persistCookie(next);
  await persistServer(next);
  closeOverlay();
  reload();
}
