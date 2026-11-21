"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AssetRangeCalendar } from "@/components/assets/AssetRangeCalendar";
import {
  isoToday,
  monthKey,
  monthStep,
  nextRangeAfterPick,
  type DateRange,
} from "@/components/assets/assetChartRange";
import { errorText } from "@/components/assets/copy";
import { StockEntryDialog, type StockDialogMode } from "@/components/assets/StockEntryDialog";
import { StockFlowChart } from "@/components/assets/StockFlowChart";
import { StockTrendChart, type TrendSeries } from "@/components/assets/StockTrendChart";
import { PageMain } from "@/components/layout";
import { fetchStockDetail } from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { htmlLang, type Locale } from "@/i18n/config";
import { formatMinor, formatQuote } from "@/lib/money";
import { useAccountWeekStart } from "@/lib/use-account-week-start";
import type { StockDetail, StockPosition } from "@/types/api/views/stock";
import type { StockFlowLabels, StockFlowNumbers } from "@/components/assets/stockFlow";

const TONES = ["text-primary", "text-indigo-600", "text-success", "text-error", "text-text-secondary"];

type StockDetailPageProps = {
  accountId: string;
};

export function StockDetailPage({ accountId }: StockDetailPageProps) {
  const t = useTranslations("assets");
  const locale = useLocale() as Locale;
  const numberLocale = htmlLang(locale);
  const weekStartsOn = useAccountWeekStart();
  const router = useRouter();
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(isoToday);
  const [month, setMonth] = useState(() => monthKey(isoToday()));
  const [range, setRange] = useState<DateRange>(() => {
    const day = isoToday();
    return { start: `${monthKey(day)}-01`, end: day };
  });
  const [pending, setPending] = useState<string | null>(null);
  const [dialog, setDialog] = useState<StockDialogMode | null>(null);
  const [editing, setEditing] = useState<StockPosition | null>(null);
  const cancelPending = useCallback(() => setPending(null), []);

  const load = useCallback(
    async (accessToken: string, next: DateRange) => {
      setLoading(true);
      setError(null);
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        setDetail(await fetchStockDetail(accessToken, accountId, next.start, next.end, timeZone));
      } catch (err) {
        setError(errorText(t, (err as { message?: string }).message ?? ""));
      } finally {
        setLoading(false);
      }
    },
    [accountId, t],
  );

  useEffect(() => {
    const accessToken = getToken();
    if (!accessToken) {
      router.push("/login");
      return;
    }
    void load(accessToken, range);
  }, [load, range, router]);

  const display = detail?.flow.display_currency ?? "CNY";
  const money = useCallback(
    (amount: number) => formatMinor(amount, display, numberLocale),
    [display, numberLocale],
  );
  const labels = useMemo<StockFlowLabels>(
    () => ({
      netAssets: t("stockDetail.netAssets"),
      totalCost: t("stockDetail.totalCost"),
      totalAssets: t("stockDetail.totalAssets"),
      marketValue: t("stockDetail.marketValue"),
      cash: t("stockDetail.cash"),
      liability: t("stockDetail.liability"),
      gain: t("stockDetail.gain"),
      bankIn: t("stockDetail.bankIn"),
      bankOut: t("stockDetail.bankOut"),
    }),
    [t],
  );
  const numbers = useMemo<StockFlowNumbers | null>(() => {
    if (!detail) return null;
    const flow = detail.flow;
    return {
      netAssets: flow.net_assets_minor,
      totalCost: flow.total_cost_minor,
      totalAssets: flow.total_assets_minor,
      marketValue: flow.market_value_minor,
      cash: flow.cash_minor,
      liability: flow.liability_minor,
      showLiability: flow.show_liability,
      gain: flow.gain_minor,
      showGain: flow.show_gain,
      bankIn: flow.bank_to_securities_minor,
      bankOut: flow.securities_to_bank_minor,
      positions: detail.positions.map((position) => ({
        id: position.id,
        name: position.name,
        value: position.market_value_minor ?? 0,
      })),
    };
  }, [detail]);
  const trend = useMemo(() => trendSeries(detail, t), [detail, t]);

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

  async function refresh() {
    const accessToken = getToken();
    if (!accessToken) return;
    setDialog(null);
    setEditing(null);
    await load(accessToken, range);
  }

  return (
    <PageMain fullWidth>
      <div className="min-w-0 space-y-lg pb-20">
        <div className="space-y-1">
          <Link href="/my/assets" className="text-small text-text-secondary hover:text-text-primary">
            {t("stockDetail.back")}
          </Link>
          <h1 className="font-subhead text-subhead text-text-primary">{detail?.account.name ?? t("stockDetail.title")}</h1>
          <p className="text-small text-text-secondary">{t("stockDetail.lead")}</p>
        </div>
        {error ? (
          <p className="rounded-xl border border-error-container bg-error-container/10 px-lg py-md text-small text-error">
            {error}
          </p>
        ) : null}
        <div className="grid w-full items-start gap-lg lg:grid-cols-[18.5rem_minmax(0,1fr)]">
          <aside className="w-full lg:sticky lg:top-lg lg:w-[18.5rem] lg:self-start">
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
          </aside>
          <div className="w-full min-w-0 space-y-lg">
            <div className="flex flex-wrap gap-2">
              <ActionButton label={t("stockDetail.addPosition")} onClick={() => openDialog("position")} />
              <ActionButton label={t("stockDetail.addTransfer")} onClick={() => openDialog("transfer")} />
              <ActionButton label={t("stockDetail.setCash")} onClick={() => openDialog("cash")} />
            </div>
            {loading && !detail ? <p className="text-small text-text-secondary">{t("loading")}</p> : null}
            {detail?.flow.fx_incomplete ? (
              <p className="rounded-xl border border-border-subtle bg-white px-lg py-md text-small text-text-secondary">
                {t("stockDetail.missingFx")}
              </p>
            ) : null}
            {detail && numbers ? (
              <div className="grid items-start gap-lg xl:grid-cols-[minmax(0,1fr)_17rem]">
                <div className="min-w-0 rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
                  <StockFlowChart
                    numbers={numbers}
                    labels={labels}
                    headers={[
                      t("stockDetail.layer1"),
                      t("stockDetail.layer2"),
                      t("stockDetail.layer3"),
                      t("stockDetail.positions"),
                    ]}
                    format={money}
                  />
                  <p className="mt-3 text-caption text-text-secondary">{t("stockDetail.formula")}</p>
                </div>
                <ul className="space-y-2">
                  {detail.positions.map((position) => (
                    <li key={position.id}>
                      <article className="rounded-xl border border-border-subtle bg-white p-md shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h2 className="text-small font-medium text-text-primary">{position.name}</h2>
                            <p className="font-code text-caption text-text-secondary">{position.symbol}</p>
                          </div>
                          <button
                            type="button"
                            className="text-caption text-primary hover:underline"
                            onClick={() => {
                              setEditing(position);
                              setDialog("mark");
                            }}
                          >
                            {t("stockDetail.updatePosition")}
                          </button>
                        </div>
                        <dl className="mt-2 space-y-1 text-caption">
                          <CardRow label={t("stockDetail.marketValue")} value={moneyOrMissing(position.market_value_minor, money, t)} />
                          <CardRow
                            label={t("stockDetail.costPrice")}
                            value={formatQuote(position.cost_price_minor)}
                          />
                          <CardRow label={t("stockDetail.shareCount")} value={t("stockDetail.shares", { count: position.shares })} />
                          <CardRow
                            label={t("stockDetail.totalPnl")}
                            value={moneyOrMissing(position.total_pnl_minor, money, t)}
                            tone={pnlTone(position.total_pnl_minor)}
                          />
                          <CardRow
                            label={t("stockDetail.periodPnl")}
                            value={moneyOrMissing(position.period_pnl_minor, money, t)}
                            tone={pnlTone(position.period_pnl_minor)}
                          />
                        </dl>
                      </article>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {trend ? (
              <section className="space-y-2">
                <h2 className="font-section-heading text-section-heading text-text-primary">{t("stockDetail.trend")}</h2>
                <StockTrendChart categories={trend.categories} series={trend.series} locale={numberLocale} formatMoney={money} />
              </section>
            ) : null}
          </div>
        </div>
      </div>
      {dialog ? (
        <StockEntryDialog
          accountId={accountId}
          mode={dialog}
          position={dialog === "mark" ? editing : null}
          onClose={() => {
            setDialog(null);
            setEditing(null);
          }}
          onSaved={refresh}
        />
      ) : null}
    </PageMain>
  );

  function openDialog(mode: StockDialogMode) {
    setEditing(null);
    setDialog(mode);
  }
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-xl border border-border-subtle bg-white px-3 py-2 text-small text-text-primary hover:border-primary"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function CardRow({ label, value, tone = "text-text-primary" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={`tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

function moneyOrMissing(
  amount: number | null,
  format: (amount: number) => string,
  t: ReturnType<typeof useTranslations<"assets">>,
): string {
  return amount == null ? t("holding.missingFx") : format(amount);
}

function pnlTone(amount: number | null): string {
  if (amount == null || amount === 0) return "text-text-primary";
  return amount > 0 ? "text-success" : "text-error";
}

function trendSeries(detail: StockDetail | null, t: ReturnType<typeof useTranslations<"assets">>) {
  if (!detail || detail.series.length === 0) return null;
  const categories = detail.series.map((point) => point.as_of);
  const aggregates: TrendSeries[] = [
    { id: "net", label: t("stockDetail.netAssets"), tone: "text-primary", values: detail.series.map((point) => point.net_assets_minor) },
    { id: "cost", label: t("stockDetail.totalCost"), tone: "text-indigo-600", values: detail.series.map((point) => point.total_cost_minor) },
    { id: "market", label: t("stockDetail.marketValue"), tone: "text-success", values: detail.series.map((point) => point.market_value_minor) },
    { id: "cash", label: t("stockDetail.cash"), tone: "text-text-secondary", values: detail.series.map((point) => point.cash_minor) },
    { id: "liability", label: t("stockDetail.liability"), tone: "text-error", values: detail.series.map((point) => point.liability_minor) },
    { id: "gain", label: t("stockDetail.gain"), tone: "text-success", values: detail.series.map((point) => point.gain_minor) },
  ];
  const ids = new Map<string, string>();
  for (const point of detail.series) {
    for (const position of point.positions) ids.set(position.id, position.name);
  }
  const stocks: TrendSeries[] = [...ids.entries()].map(([id, name], index) => ({
    id,
    label: name,
    tone: TONES[index % TONES.length],
    values: detail.series.map((point) => point.positions.find((item) => item.id === id)?.market_value_minor ?? 0),
  }));
  return { categories, series: [...stocks, ...aggregates] };
}
