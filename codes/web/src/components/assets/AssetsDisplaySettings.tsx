"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { currencyLabel, errorText } from "@/components/assets/copy";
import { updateAssetProfile } from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import type { AssetFxRate, AssetProfile } from "@/types/api/views/assets";

const CURRENCIES = ["CNY", "USD", "EUR", "GBP", "HKD", "JPY", "KRW"] as const;
const ECB_PAGE =
  "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";

type AssetsDisplaySettingsProps = {
  profile: AssetProfile;
  rates: AssetFxRate[];
  locale: string;
  onChanged: () => void;
};

export function AssetsDisplaySettings({ profile, rates, locale, onChanged }: AssetsDisplaySettingsProps) {
  const t = useTranslations("assets");
  const [currency, setCurrency] = useState(profile.display_currency);
  const [version, setVersion] = useState(profile.version);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asOf = rates.map((rate) => rate.as_of).find((value) => value) ?? null;

  async function changeCurrency(next: string) {
    const accessToken = getToken();
    if (!accessToken || next === currency) return;
    const previous = currency;
    setCurrency(next);
    setSaving(true);
    setError(null);
    try {
      const saved = await updateAssetProfile(accessToken, { version, display_currency: next });
      setVersion(saved.version);
      setCurrency(saved.display_currency);
      onChanged();
    } catch (err) {
      setCurrency(previous);
      const code = (err as { message?: string }).message ?? "";
      setError(code === "version_conflict" ? errorText(t, code) : t("display.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border-subtle bg-white px-md py-sm">
      <h2 className="font-headline text-small text-text-primary">{t("display.title")}</h2>
      <p className="mt-1 text-caption text-text-secondary">{t("display.hint")}</p>
      <label className="mt-sm block">
        <span className="sr-only">{t("display.title")}</span>
        <select
          value={currency}
          disabled={saving}
          onChange={(event) => void changeCurrency(event.target.value)}
          className="w-full rounded-xl border border-border-subtle bg-surface-bright px-3 py-2 text-small text-text-primary outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-50"
        >
          {CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {currencyLabel(t, code)}
            </option>
          ))}
        </select>
      </label>
      {saving ? <p className="mt-2 text-caption text-text-secondary">{t("display.saving")}</p> : null}
      {error ? <p className="mt-2 text-caption text-error">{error}</p> : null}

      <h3 className="mt-md text-caption font-medium text-text-primary">{t("display.ratesTitle")}</h3>
      <p className="mt-1 text-caption text-neutral-muted">{t("display.ratesHint")}</p>
      {rates.length === 0 ? (
        <p className="mt-2 text-caption text-text-secondary">{t("display.empty")}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rates.map((rate) => (
            <li key={rate.currency} className="flex items-baseline justify-between gap-2 text-caption">
              <span className="min-w-0 truncate text-text-secondary">{currencyLabel(t, rate.currency)}</span>
              <span className="shrink-0 tabular-nums text-text-primary">{formatRate(rate.cny_per_unit, locale)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-caption text-neutral-muted">
        <a href={ECB_PAGE} target="_blank" rel="noreferrer" className="text-primary hover:underline">
          {t("display.source")}
        </a>
        {asOf ? <span> · {t("display.asOf", { date: formatDay(asOf, locale) })}</span> : null}
      </p>
    </section>
  );
}

function formatRate(value: string, locale: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(amount);
}

function formatDay(iso: string, locale: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(
    new Date(year, month - 1, day),
  );
}
