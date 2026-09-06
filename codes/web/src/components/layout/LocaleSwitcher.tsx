"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { changeLocaleAction } from "@/i18n/actions";
import { LOCALES, type Locale } from "@/i18n/config";

type LocaleSwitcherProps = {
  variant: "menu" | "footer";
};

export function LocaleSwitcher({ variant }: LocaleSwitcherProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("locale");
  const router = useRouter();

  async function select(next: Locale) {
    if (next === locale) return;
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
    <div role="group" aria-label={t("switchAria")}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          role="menuitemradio"
          aria-checked={code === locale}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-small text-text-secondary transition-colors hover:bg-surface-container-lowest"
          onClick={() => void select(code)}
        >
          <span>{t(code)}</span>
          {code === locale ? <span aria-hidden>✓</span> : null}
        </button>
      ))}
    </div>
  );
}
