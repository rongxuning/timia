"use client";

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { changeLocaleAction } from "@/i18n/actions";
import { LOCALES, localeCookieSetter, type Locale } from "@/i18n/config";

type LocaleSwitcherProps = {
  variant: "field" | "footer";
  id?: string;
};

export function LocaleSwitcher({ variant, id }: LocaleSwitcherProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("locale");
  const router = useRouter();
  const autoId = useId();
  const selectId = id ?? autoId;

  async function select(next: Locale) {
    if (next === locale) return;
    document.cookie = localeCookieSetter(next, window.location.protocol === "https:");
    await changeLocaleAction(next);
    router.refresh();
  }

  if (variant === "footer") {
    return (
      <div className="flex items-center gap-sm" aria-label={t("switchAria")}>
        {LOCALES.map((code, index) => (
          <span key={code} className="inline-flex items-center gap-sm">
            {index > 0 ? <span aria-hidden>·</span> : null}
            <button
              type="button"
              className={
                code === locale
                  ? "text-text-primary"
                  : "transition-colors hover:text-text-secondary"
              }
              aria-current={code === locale ? "true" : undefined}
              onClick={() => void select(code)}
            >
              {t(code)}
            </button>
          </span>
        ))}
      </div>
    );
  }

  return (
    <select
      id={selectId}
      aria-label={id ? undefined : t("switchAria")}
      className="w-full rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-small text-text-primary outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
      value={locale}
      onChange={(event) => void select(event.target.value as Locale)}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {t(code)}
        </option>
      ))}
    </select>
  );
}
