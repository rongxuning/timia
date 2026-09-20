"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { applyLocaleChange } from "@/i18n/applyLocaleChange";
import { changeLocaleAction } from "@/i18n/actions";
import { LOCALES, localeCookieSetter, type Locale } from "@/i18n/config";

type LocaleSwitcherProps = {
  variant: "menu" | "footer";
  onSelected?: () => void;
};

export function LocaleSwitcher({ variant, onSelected }: LocaleSwitcherProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("locale");

  async function select(next: Locale) {
    await applyLocaleChange({
      current: locale,
      next,
      persistCookie: (value) => {
        document.cookie = localeCookieSetter(value, window.location.protocol === "https:");
      },
      persistServer: changeLocaleAction,
      closeOverlay: () => onSelected?.(),
      reload: () => {
        window.location.reload();
      },
    });
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

  return <LocaleMenuSelect locale={locale} label={t("switchAria")} optionLabel={t} onPick={select} />;
}

function LocaleMenuSelect({
  locale,
  label,
  optionLabel,
  onPick,
}: {
  locale: Locale;
  label: string;
  optionLabel: (code: Locale) => string;
  onPick: (next: Locale) => Promise<void>;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div ref={rootRef} className="px-3 pb-1">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-surface px-2 py-1.5 text-left text-small text-text-primary outline-none transition-colors hover:bg-surface-container-lowest focus:border-primary focus:ring-4 focus:ring-primary/10"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{optionLabel(locale)}</span>
        <span
          className="material-symbols-outlined text-[18px] text-text-secondary"
          aria-hidden
        >
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="mt-1 overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-sm"
        >
          {LOCALES.map((code) => {
            const selected = code === locale;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={selected}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-small text-text-secondary transition-colors hover:bg-surface-container-lowest"
                onClick={() => {
                  setOpen(false);
                  void onPick(code);
                }}
              >
                <span>{optionLabel(code)}</span>
                {selected ? <span aria-hidden>✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
