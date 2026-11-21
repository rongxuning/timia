"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { AssetRangeCalendar } from "@/components/assets/AssetRangeCalendar";
import {
  isoToday,
  monthKey,
  monthStep,
  nextRangeAfterPick,
  type DateRange,
} from "@/components/assets/assetChartRange";
import { BankEntryDialog, type BankDialogMode } from "@/components/assets/BankEntryDialog";
import { errorText } from "@/components/assets/copy";
import { StockTrendChart, type TrendSeries } from "@/components/assets/StockTrendChart";
import { primeBankAccountNameForBreadcrumb } from "@/components/Breadcrumbs";
import { PageMain } from "@/components/layout";
import { fetchBankDetail } from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { htmlLang, type Locale } from "@/i18n/config";
import { formatMinor } from "@/lib/money";
import { useAccountWeekStart } from "@/lib/use-account-week-start";
import type { BankDetail, BankProduct } from "@/types/api/views/bank";

type BankDetailPageProps = {
  accountId: string;
};

export function BankDetailPage({ accountId }: BankDetailPageProps) {
  const t = useTranslations("assets");
  const locale = useLocale() as Locale;
  const numberLocale = htmlLang(locale);
  const weekStartsOn = useAccountWeekStart();
  const router = useRouter();
  const [detail, setDetail] = useState<BankDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today] = useState(isoToday);
  const [month, setMonth] = useState(() => monthKey(isoToday()));
  const [range, setRange] = useState<DateRange>(() => {
    const day = isoToday();
    return { start: `${monthKey(day)}-01`, end: day };
  });
  const [pending, setPending] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<BankDialogMode | null>(null);
  const [editing, setEditing] = useState<BankProduct | null>(null);
  const cancelPending = useCallback(() => setPending(null), []);

  const load = useCallback(
    async (accessToken: string, next: DateRange, productId: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const loaded = await fetchBankDetail(accessToken, accountId, next.start, next.end, timeZone, productId);
        primeBankAccountNameForBreadcrumb(loaded.account.id, loaded.account.name);
        setDetail(loaded);
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
    void load(accessToken, range, selectedId);
  }, [load, range, router, selectedId]);

  const display = detail?.summary.display_currency ?? "CNY";
  const money = useCallback(
    (amount: number) => formatMinor(amount, display, numberLocale),
    [display, numberLocale],
  );

  const accountSeries = useMemo<TrendSeries[]>(() => {
    if (!detail) return [];
    return [
      {
        id: "total_assets",
        label: t("bankDetail.totalAssets"),
        tone: "text-primary",
        values: detail.series.map((point) => point.total_assets_minor),
      },
    ];
  }, [detail, t]);

  const accountCategories = useMemo(() => detail?.series.map((point) => point.as_of) ?? [], [detail]);

  const selectedSeries = useMemo(() => {
    const selected = detail?.selected;
    if (!selected) return { categories: [] as string[], series: [] as TrendSeries[] };
    const categories = selected.series.map((point) => point.as_of);
    if (selected.product.product_kind === "investment") {
      return {
        categories,
        series: [
          {
            id: "value",
            label: t("bankDetail.totalValue"),
            tone: "text-primary",
            values: selected.series.map((point) => point.primary_minor),
          },
          {
            id: "cost",
            label: t("bankDetail.cost"),
            tone: "text-text-secondary",
            values: selected.series.map((point) => point.secondary_minor),
          },
        ] satisfies TrendSeries[],
      };
    }
    if (selected.product.product_kind === "credit") {
      return {
        categories,
        series: [
          {
            id: "statement",
            label: t("bankDetail.monthBill"),
            tone: "text-error",
            values: selected.series.map((point) => point.primary_minor),
          },
        ] satisfies TrendSeries[],
      };
    }
    return {
      categories,
      series: [
        {
          id: "balance",
          label: t("bankDetail.totalAssets"),
          tone: "text-primary",
          values: selected.series.map((point) => point.primary_minor),
        },
      ] satisfies TrendSeries[],
    };
  }, [detail, t]);

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
    await load(accessToken, range, selectedId);
  }

  function openUpdate(product: BankProduct) {
    setEditing(product);
    setDialog(product.product_kind);
  }

  return (
    <PageMain fullWidth>
      <div className="min-w-0 space-y-lg pb-20">
        <h1 className="sr-only">{detail?.account.name ?? t("bankDetail.title")}</h1>
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
            {loading && !detail ? <p className="text-small text-text-secondary">{t("loading")}</p> : null}
            {detail?.summary.fx_incomplete ? (
              <p className="rounded-xl border border-border-subtle bg-white px-lg py-md text-small text-text-secondary">
                {t("bankDetail.missingFx")}
              </p>
            ) : null}
            {detail ? (
              <section className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-section-heading text-section-heading text-text-primary">
                    {t("bankDetail.totalAssets")}
                  </h2>
                  <p className="text-small tabular-nums text-text-primary">{money(detail.summary.total_assets_minor)}</p>
                </div>
                {accountCategories.length > 0 ? (
                  <StockTrendChart
                    categories={accountCategories}
                    series={accountSeries}
                    locale={numberLocale}
                    formatMoney={money}
                  />
                ) : (
                  <p className="rounded-xl border border-border-subtle bg-white px-lg py-md text-small text-text-secondary">
                    {t("charts.empty")}
                  </p>
                )}
              </section>
            ) : null}

            <section className="space-y-3">
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {detail?.products.map((product) => {
                  const selected = selectedId === product.id;
                  return (
                    <li key={product.id} className="min-w-0">
                      <article
                        className={
                          selected
                            ? "flex h-full w-full flex-col rounded-xl border border-primary bg-indigo-50/40 p-md shadow-sm"
                            : "flex h-full w-full flex-col rounded-xl border border-border-subtle bg-white p-md hover:border-primary"
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setSelectedId((current) => (current === product.id ? null : product.id))}
                          >
                            <p className="truncate text-small font-medium text-text-primary">{product.name}</p>
                            <p className="mt-1 text-caption text-text-secondary">
                              {t(`bankDetail.kinds.${product.product_kind}`)}
                            </p>
                          </button>
                          <button
                            type="button"
                            className="shrink-0 text-caption text-primary hover:underline"
                            onClick={() => openUpdate(product)}
                          >
                            {t("bankDetail.update")}
                          </button>
                        </div>
                        <button
                          type="button"
                          className="mt-2 w-full text-left"
                          onClick={() => setSelectedId((current) => (current === product.id ? null : product.id))}
                        >
                          <dl className="space-y-1 text-caption">
                            <ProductFigures product={product} money={money} t={t} />
                          </dl>
                        </button>
                      </article>
                    </li>
                  );
                })}
                <li className="min-w-0">
                  <button
                    type="button"
                    className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border-subtle bg-white p-md text-small text-text-secondary hover:border-primary hover:text-primary"
                    onClick={() => {
                      setEditing(null);
                      setDialog("create");
                    }}
                  >
                    <span className="material-symbols-outlined text-[22px] leading-none" aria-hidden>
                      add
                    </span>
                    {t("bankDetail.addCard")}
                  </button>
                </li>
              </ul>
            </section>

            {detail?.selected ? (
              <section className="space-y-lg">
                <div className="space-y-2">
                  <h2 className="font-section-heading text-section-heading text-text-primary">
                    {detail.selected.product.name}
                  </h2>
                  {selectedSeries.categories.length > 0 ? (
                    <StockTrendChart
                      categories={selectedSeries.categories}
                      series={selectedSeries.series}
                      locale={numberLocale}
                      formatMoney={money}
                    />
                  ) : (
                    <p className="rounded-xl border border-border-subtle bg-white px-lg py-md text-small text-text-secondary">
                      {t("charts.empty")}
                    </p>
                  )}
                </div>
                <ProductLedger detail={detail} money={money} locale={numberLocale} t={t} />
              </section>
            ) : null}
          </div>
        </div>
      </div>
      {dialog ? (
        <BankEntryDialog
          accountId={accountId}
          mode={dialog}
          product={dialog === "create" ? null : editing}
          onClose={() => {
            setDialog(null);
            setEditing(null);
          }}
          onSaved={refresh}
        />
      ) : null}
    </PageMain>
  );
}

function ProductFigures({
  product,
  money,
  t,
}: {
  product: BankProduct;
  money: (amount: number) => string;
  t: ReturnType<typeof useTranslations<"assets">>;
}) {
  if (product.product_kind === "savings") {
    return <Row label={t("bankDetail.totalAssets")} value={money(product.balance_minor)} />;
  }
  if (product.product_kind === "investment") {
    return (
      <>
        <Row label={t("bankDetail.totalValue")} value={money(product.value_minor)} />
        <Row label={t("bankDetail.cost")} value={money(product.cost_minor)} />
        <Row
          label={t("bankDetail.floatingPnl")}
          value={product.floating_pnl_minor == null ? t("holding.missingFx") : money(product.floating_pnl_minor)}
          tone={pnlTone(product.floating_pnl_minor)}
        />
      </>
    );
  }
  return (
    <>
      <Row label={t("bankDetail.creditLimit")} value={money(product.limit_minor)} />
      <Row label={t("bankDetail.monthBill")} value={money(product.statement_minor)} />
      <Row label={t("bankDetail.paidOff")} value={product.paid_off ? t("bankDetail.yes") : t("bankDetail.no")} />
    </>
  );
}

function ProductLedger({
  detail,
  money,
  locale,
  t,
}: {
  detail: BankDetail;
  money: (amount: number) => string;
  locale: string;
  t: ReturnType<typeof useTranslations<"assets">>;
}) {
  const selected = detail.selected;
  if (!selected) return null;
  if (selected.product.product_kind === "savings") {
    return (
      <LedgerList
        title={t("bankDetail.txns")}
        empty={t("bankDetail.txnsEmpty")}
        rows={selected.savings_txns.map((row) => ({
          id: row.id,
          primary: money(row.balance_minor),
          secondary: `${signed(row.delta_minor, money)} · ${row.reason}`,
          when: formatStamp(row.recorded_at, locale),
        }))}
      />
    );
  }
  if (selected.product.product_kind === "investment") {
    return (
      <LedgerList
        title={t("bankDetail.ops")}
        empty={t("bankDetail.opsEmpty")}
        rows={selected.investment_ops.map((row) => ({
          id: row.id,
          primary: money(row.value_minor),
          secondary: `${t("bankDetail.cost")}: ${money(row.cost_minor)} · ${t("bankDetail.costDelta")}: ${signed(row.cost_delta_minor, money)} · ${row.reason}`,
          when: formatStamp(row.recorded_at, locale),
        }))}
      />
    );
  }
  return (
    <LedgerList
      title={t("bankDetail.bills")}
      empty={t("bankDetail.billsEmpty")}
      rows={selected.credit_bills.map((row) => ({
        id: row.id,
        primary: `${row.year_month} · ${money(row.statement_minor)}`,
        secondary: `${t("bankDetail.creditLimit")}: ${money(row.limit_minor)} · ${row.paid_off ? t("bankDetail.yes") : t("bankDetail.no")} · ${row.reason}`,
        when: formatStamp(row.recorded_at, locale),
      }))}
    />
  );
}

function LedgerList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; primary: string; secondary: string; when: string }>;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-small font-medium text-text-primary">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-white px-lg py-md text-small text-text-secondary">{empty}</p>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-white">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 px-lg py-md">
              <div className="min-w-0">
                <p className="text-small tabular-nums text-text-primary">{row.primary}</p>
                <p className="mt-1 text-caption text-text-secondary">{row.secondary}</p>
              </div>
              <p className="shrink-0 text-caption text-text-secondary">{row.when}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ label, value, tone = "text-text-primary" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={`tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

function signed(amount: number, money: (amount: number) => string): string {
  if (amount > 0) return `+${money(amount)}`;
  return money(amount);
}

function pnlTone(amount: number | null): string {
  if (amount == null || amount === 0) return "text-text-primary";
  return amount > 0 ? "text-error" : "text-success";
}

function formatStamp(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
