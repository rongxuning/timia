"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AccountSection, type AccountCard } from "@/components/assets/AccountSection";
import { AssetBalanceCharts } from "@/components/assets/AssetBalanceCharts";
import { AssetRangeCalendar } from "@/components/assets/AssetRangeCalendar";
import {
  filterDailySeries,
  isoToday,
  monthKey,
  monthStep,
  nextRangeAfterPick,
  type DateRange,
} from "@/components/assets/assetChartRange";
import { errorText } from "@/components/assets/copy";
import { PageMain } from "@/components/layout";
import { fetchMyAssets } from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { htmlLang, type Locale } from "@/i18n/config";
import { formatMinor } from "@/lib/money";
import { useAccountWeekStart } from "@/lib/use-account-week-start";
import type { MyAssetsView } from "@/types/api/views/assets";

const LEDGER_KINDS = new Set(["savings", "credit", "stock", "metal", "forex"]);

function ledgerAccounts(view: MyAssetsView | null): AccountCard[] {
  const cards: AccountCard[] = [];
  for (const party of view?.parties ?? []) {
    for (const account of party.accounts) {
      if (!LEDGER_KINDS.has(account.account_kind) || !account.account_number) continue;
      cards.push({
        id: account.id,
        code: account.code,
        name: account.name,
        account_kind: account.account_kind,
        account_number: account.account_number,
      });
    }
  }
  cards.sort((left, right) => left.code.localeCompare(right.code));
  return cards;
}

export function AssetsPage() {
  const t = useTranslations("assets");
  const locale = useLocale() as Locale;
  const numberLocale = htmlLang(locale);
  const weekStartsOn = useAccountWeekStart();
  const router = useRouter();
  const [view, setView] = useState<MyAssetsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(isoToday);
  const [month, setMonth] = useState(() => monthKey(isoToday()));
  const [range, setRange] = useState<DateRange>(() => {
    const day = isoToday();
    return { start: `${monthKey(day)}-01`, end: day };
  });
  const [pending, setPending] = useState<string | null>(null);
  const cancelPending = useCallback(() => setPending(null), []);

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

  const refresh = useCallback(
    async (accessToken: string) => {
      try {
        setView(await fetchMyAssets(accessToken));
      } catch (err) {
        setError(errorText(t, (err as { message?: string }).message ?? ""));
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
  const money = useCallback(
    (amount: number) => formatMinor(amount, display, numberLocale),
    [display, numberLocale],
  );
  const curve = useMemo(
    () => filterDailySeries(view?.daily_series ?? [], range.start, range.end),
    [view, range.start, range.end],
  );

  function changeMonth(delta: number) {
    const step = monthStep(month, delta, today, pending);
    setMonth(step.month);
    if (step.range) setRange(step.range);
  }

  function pickDate(date: string) {
    if (date > today) return;
    const next = nextRangeAfterPick(range, pending, date);
    setPending(next.pending);
    setRange(next.range);
  }

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

        <div className="grid items-start gap-lg lg:grid-cols-[18.5rem_minmax(0,1fr)]">
          <aside className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            <AssetRangeCalendar
              month={month}
              today={today}
              range={range}
              pending={pending}
              locale={numberLocale}
              weekStartsOn={weekStartsOn}
              onMonthChange={changeMonth}
              onPick={pickDate}
              onCancelPending={cancelPending}
            />
            {summary ? (
              <>
                <Stat label={t("summary.netWorth")} value={money(summary.net_worth_minor)} hint={t("summary.asOfToday")} />
                <Stat label={t("summary.assets")} value={money(summary.total_assets_minor)} hint={t("summary.asOfToday")} />
                <Stat
                  label={t("summary.liabilities")}
                  value={money(summary.total_liabilities_minor)}
                  hint={t("summary.asOfToday")}
                />
              </>
            ) : loading ? (
              <p className="text-small text-text-secondary">{t("loading")}</p>
            ) : null}
          </aside>

          <div className="min-w-0 space-y-lg">
            {view ? (
              <AccountSection
                accounts={ledgerAccounts(view)}
                onSaved={async () => {
                  const accessToken = getToken();
                  if (accessToken) await refresh(accessToken);
                }}
              />
            ) : loading ? (
              <p className="text-small text-text-secondary">{t("loading")}</p>
            ) : null}
            {view ? <AssetBalanceCharts series={curve} locale={numberLocale} formatMoney={money} /> : null}
          </div>
        </div>
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
