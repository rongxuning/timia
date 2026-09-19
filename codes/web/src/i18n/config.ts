export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh";
export const LOCALE_COOKIE = "locale";
export const LOCALE_MAX_AGE = 31536000;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "zh" || value === "en";
}

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function htmlLang(locale: Locale): "zh-CN" | "en" {
  return locale === "zh" ? "zh-CN" : "en";
}

export function localeCookieSetter(locale: Locale, secure: boolean): string {
  const securePart = secure ? "; Secure" : "";
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_MAX_AGE}; SameSite=Lax${securePart}`;
}
