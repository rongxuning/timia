"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AssetsDisplaySettings } from "@/components/assets/AssetsDisplaySettings";
import { AssetsMixPies, categorySlices } from "@/components/assets/AssetsMixPies";
import { AssetsRangeCalendar, defaultRangeStart } from "@/components/assets/AssetsRangeCalendar";
import { AssetsTrendChart, hasDailyMovement, sliceDailySeries } from "@/components/assets/AssetsTrendChart";
import { categoryLabel, errorText } from "@/components/assets/copy";
import { PageMain } from "@/components/layout";
import { fetchMyAssets } from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { htmlLang, type Locale } from "@/i18n/config";
import { formatMinor } from "@/lib/money";
import type { MyAssetsView } from "@/types/api/views/assets";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function localDateFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AssetsPage() {
  const t = useTranslations("assets");
  const locale = useLocale() as Locale;
  const numberLocale = htmlLang(locale);
  const router = useRouter();
  const [view, setView] = useState<MyAssetsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => localToday(), []);
  const [rangeStart, setRangeStart] = useState(() => defaultRangeStart(localToday()));
  const [rangeEnd, setRangeEnd] = useState(() => localToday());

  const load = useCallback(
    async (accessToken: string, quiet = false) => {
      if (!quiet) setLoading(true);
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
  const chartPoints = useMemo(
    () => sliceDailySeries(view?.daily_series ?? [], rangeStart, rangeEnd),
    [rangeEnd, rangeStart, view?.daily_series],
  );
  const showChart = hasDailyMovement(chartPoints);
  const labelFor = (category: string) => categoryLabel(t, category);

  return (
    <PageMain className="!px-3" fullWidth>
      <div className="grid items-start gap-lg lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="self-start space-y-lg lg:sticky lg:top-lg lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          <AssetsRangeCalendar
            start={rangeStart}
            end={rangeEnd}
            today={today}
            locale={numberLocale}
            changeDates={(view?.change_ats ?? []).map(localDateFromIso)}
            onRangeChange={(start, end) => {
              setRangeStart(start);
              setRangeEnd(end);
            }}
          />
          {view ? (
            <AssetsDisplaySettings
              key={`${view.profile.display_currency}:${view.profile.version}`}
              profile={view.profile}
              rates={view.rates}
              locale={numberLocale}
              onChanged={() => {
                const accessToken = getToken();
                if (accessToken) void load(accessToken, true);
              }}
            />
          ) : null}
        </aside>
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
              <Stat label={t("summary.netWorth")} value={money(summary.net_worth_minor)} hint={t("summary.asOfNow")} />
              <Stat label={t("summary.assets")} value={money(summary.total_assets_minor)} hint={t("summary.asOfNow")} />
              <Stat label={t("summary.liabilities")} value={money(summary.total_liabilities_minor)} hint={t("summary.asOfNow")} />
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

          <section className="rounded-xl border border-border-subtle bg-white p-lg">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-small font-medium text-text-primary">{t("chart.title")}</h2>
              {showChart ? <p className="text-caption text-text-secondary">{t("chart.caption")}</p> : null}
            </div>
            {showChart ? (
              <div className="mt-3">
                <AssetsTrendChart points={chartPoints} formatMoney={money} />
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </PageMain>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
      <p className="text-overline text-neutral-muted">{label}</p>
      <p className="mt-2 text-xl tabular-nums text-text-primary">{value}</p>
      {hint ? <p className="mt-1 text-caption text-text-secondary">{hint}</p> : null}
    </article>
  );
}
