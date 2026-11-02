"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AssetsMixPies, categorySlices } from "@/components/assets/AssetsMixPies";
import { categoryLabel, errorText } from "@/components/assets/copy";
import { PageMain } from "@/components/layout";
import { fetchMyAssets } from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { htmlLang, type Locale } from "@/i18n/config";
import { formatMinor } from "@/lib/money";
import type { MyAssetsView } from "@/types/api/views/assets";

export function AssetsPage() {
  const t = useTranslations("assets");
  const locale = useLocale() as Locale;
  const numberLocale = htmlLang(locale);
  const router = useRouter();
  const [view, setView] = useState<MyAssetsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (accessToken: string) => {
      setLoading(true);
      setError(null);
      try {
        setView(await fetchMyAssets(accessToken));
      } catch (err) {
        setError(errorText(t, (err as { message?: string }).message ?? ""));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const accessToken = getToken();
    if (!accessToken) {
      router.push("/login");
      return;
    }
    void load(accessToken);
  }, [load, router]);

  const summary = view?.summary;
  const display = summary?.display_currency ?? "CNY";
  const money = (amount: number) => formatMinor(amount, display, numberLocale);
  const labelFor = (category: string) => categoryLabel(t, category);

  return (
    <PageMain>
      <div className="min-w-0 space-y-lg pb-20">
        <div>
          <h1 className="font-subhead text-subhead text-text-primary">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-small text-text-secondary">{t("subtitle")}</p>
        </div>

        {error ? (
          <p className="rounded-xl border border-error-container bg-error-container/10 px-lg py-md text-small text-error">
            {error}
          </p>
        ) : null}
        {loading ? <p className="text-small text-text-secondary">{t("loading")}</p> : null}

        {summary ? (
          <section className="grid gap-3 md:grid-cols-3">
            <Stat label={t("summary.netWorth")} value={money(summary.net_worth_minor)} hint={t("summary.asOfToday")} />
            <Stat label={t("summary.assets")} value={money(summary.total_assets_minor)} hint={t("summary.asOfToday")} />
            <Stat label={t("summary.liabilities")} value={money(summary.total_liabilities_minor)} hint={t("summary.asOfToday")} />
          </section>
        ) : null}

        {summary ? (
          <AssetsMixPies
            netWorth={summary.net_worth_minor}
            assets={summary.total_assets_minor}
            liabilities={summary.total_liabilities_minor}
            assetSlices={categorySlices(view?.groups ?? [], "asset", labelFor)}
            liabilitySlices={categorySlices(view?.groups ?? [], "liability", labelFor)}
            locale={numberLocale}
            formatMoney={money}
          />
        ) : null}
      </div>
    </PageMain>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-xl border border-primary/15 bg-primary-fixed p-lg shadow-sm">
      <p className="text-overline text-on-primary-fixed-variant">{label}</p>
      <p className="mt-2 text-xl tabular-nums text-text-primary">{value}</p>
      {hint ? <p className="mt-1 text-caption text-on-surface-variant">{hint}</p> : null}
    </article>
  );
}
