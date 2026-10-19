"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ACCOUNT_STARTERS,
  BOOK_CURRENCIES,
  EXPENSE_STARTERS,
  type AssetKind,
  type ExpenseGroup,
} from "@/components/assets/categories";
import {
  categoryLabel,
  currencyLabel,
  errorText,
  focusText,
  groupHint,
  groupLabel,
  starterLabel,
} from "@/components/assets/copy";
import { ExpenseDialog, type ExpenseDraft } from "@/components/assets/ExpenseDialog";
import { fieldClass, labelClass } from "@/components/assets/fields";
import { HoldingDialog, type HoldingDraft } from "@/components/assets/HoldingDialog";
import { PageMain } from "@/components/layout";
import {
  adjustAssetExpense,
  adjustAssetHolding,
  archiveAssetExpense,
  archiveAssetHolding,
  createAssetExpense,
  createAssetHolding,
  fetchAssetExpense,
  fetchAssetHolding,
  fetchMyAssets,
  updateAssetHolding,
  updateAssetProfile,
  upsertFxRate,
} from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { htmlLang, type Locale } from "@/i18n/config";
import { formatMinor, formatStamp, localInputToIso, minorToInput, nowLocalInput, parseAmountToMinor } from "@/lib/money";
import type { AssetAdjustment, AssetExpense, AssetHolding, MyAssetsView } from "@/types/api/views/assets";

const RATE_CURRENCIES = ["HKD", "JPY", "KRW", "USD", "EUR", "GBP"];

function blankHolding(kind: AssetKind, category: string, currency: string, name: string): HoldingDraft {
  return {
    mode: "create",
    name,
    kind,
    category,
    currency,
    amount: "",
    institution: "",
    note: "",
    includeInNetWorth: true,
    reason: "",
    recordedAt: nowLocalInput(),
  };
}

function blankExpense(group: ExpenseGroup, currency: string, name: string, amount = ""): ExpenseDraft {
  return {
    mode: "create",
    name,
    group,
    currency,
    amount,
    reason: "",
    recordedAt: nowLocalInput(),
  };
}

export function AssetsPage() {
  const t = useTranslations("assets");
  const locale = useLocale() as Locale;
  const numberLocale = htmlLang(locale);
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<MyAssetsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holdingDraft, setHoldingDraft] = useState<HoldingDraft | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const [history, setHistory] = useState<AssetAdjustment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [currentHolding, setCurrentHolding] = useState<AssetHolding | null>(null);
  const [currentExpense, setCurrentExpense] = useState<AssetExpense | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [rateMessage, setRateMessage] = useState<string | null>(null);

  const load = useCallback(
    async (accessToken: string) => {
      setLoading(true);
      setError(null);
      try {
        const next = await fetchMyAssets(accessToken);
        setView(next);
        const nextRates: Record<string, string> = {};
        for (const rate of next.rates) nextRates[rate.currency] = rate.cny_per_unit;
        setRates(nextRates);
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
    setToken(accessToken);
    void load(accessToken);
  }, [load, router]);

  async function reload() {
    if (!token) return;
    const next = await fetchMyAssets(token);
    setView(next);
  }

  function fail(err: unknown) {
    const message = (err as { message?: string }).message ?? "";
    if (message === "version_conflict") void reload();
    setDialogError(errorText(t, message));
  }

  async function openHolding(holding: AssetHolding) {
    if (!token) return;
    setDialogError(null);
    setCurrentHolding(holding);
    setHistory([]);
    setHoldingDraft({
      mode: "adjust",
      id: holding.id,
      version: holding.version,
      name: holding.name,
      kind: holding.kind,
      category: holding.category,
      currency: holding.currency,
      amount: minorToInput(holding.amount_minor, holding.currency),
      institution: holding.institution ?? "",
      note: holding.note ?? "",
      includeInNetWorth: holding.include_in_net_worth,
      reason: "",
      recordedAt: nowLocalInput(),
    });
    setHistoryLoading(true);
    try {
      const detail = await fetchAssetHolding(token, holding.id);
      setHistory(detail.adjustments);
      setCurrentHolding({ ...holding, version: detail.version, amount_minor: detail.amount_minor });
      setHoldingDraft((current) =>
        current && current.id === holding.id ? { ...current, version: detail.version } : current,
      );
    } catch (err) {
      fail(err);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openExpense(item: AssetExpense) {
    if (!token) return;
    setDialogError(null);
    setCurrentExpense(item);
    setHistory([]);
    setExpenseDraft({
      mode: "adjust",
      id: item.id,
      version: item.version,
      name: item.name,
      group: item.group_kind,
      currency: item.currency,
      amount: minorToInput(item.amount_minor, item.currency),
      reason: "",
      recordedAt: nowLocalInput(),
    });
    try {
      const detail = await fetchAssetExpense(token, item.id);
      setHistory(detail.adjustments);
      setCurrentExpense({ ...item, version: detail.version, amount_minor: detail.amount_minor });
      setExpenseDraft((current) => (current && current.id === item.id ? { ...current, version: detail.version } : current));
    } catch (err) {
      fail(err);
    }
  }

  async function createHolding() {
    if (!token || !holdingDraft) return;
    const amount = parseAmountToMinor(holdingDraft.amount, holdingDraft.currency);
    if (!holdingDraft.name.trim() || !holdingDraft.reason.trim() || amount == null) {
      setDialogError(t("form.amountInvalid"));
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      await createAssetHolding(token, {
        name: holdingDraft.name.trim(),
        kind: holdingDraft.kind,
        category: holdingDraft.category,
        currency: holdingDraft.currency,
        amount_minor: amount,
        institution: holdingDraft.institution.trim() || null,
        note: holdingDraft.note.trim() || null,
        include_in_net_worth: holdingDraft.includeInNetWorth,
        reason: holdingDraft.reason.trim(),
        recorded_at: localInputToIso(holdingDraft.recordedAt),
      });
      await reload();
      setHoldingDraft(null);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function adjustHolding() {
    if (!token || !holdingDraft?.id || !holdingDraft.version) return;
    const amount = parseAmountToMinor(holdingDraft.amount, holdingDraft.currency);
    if (!holdingDraft.reason.trim() || amount == null) {
      setDialogError(t("form.amountInvalid"));
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      await adjustAssetHolding(token, holdingDraft.id, {
        version: holdingDraft.version,
        amount_minor: amount,
        reason: holdingDraft.reason.trim(),
        recorded_at: localInputToIso(holdingDraft.recordedAt),
      });
      await reload();
      setHoldingDraft(null);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function saveHoldingDetails() {
    if (!token || !holdingDraft?.id || !holdingDraft.version) return;
    setSaving(true);
    setDialogError(null);
    try {
      const saved = await updateAssetHolding(token, holdingDraft.id, {
        version: holdingDraft.version,
        name: holdingDraft.name.trim(),
        category: holdingDraft.category,
        kind: holdingDraft.kind,
        institution: holdingDraft.institution.trim() || null,
        note: holdingDraft.note.trim() || null,
        include_in_net_worth: holdingDraft.includeInNetWorth,
      });
      setHoldingDraft({ ...holdingDraft, version: saved.version });
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function archiveHolding(reason: string) {
    if (!token || !holdingDraft?.id || !holdingDraft.version || !reason) return;
    setSaving(true);
    try {
      await archiveAssetHolding(token, holdingDraft.id, { version: holdingDraft.version, reason });
      await reload();
      setHoldingDraft(null);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function createExpense() {
    if (!token || !expenseDraft) return;
    const amount = parseAmountToMinor(expenseDraft.amount, expenseDraft.currency);
    if (!expenseDraft.name.trim() || !expenseDraft.reason.trim() || amount == null) {
      setDialogError(t("form.amountInvalid"));
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      await createAssetExpense(token, {
        name: expenseDraft.name.trim(),
        group_kind: expenseDraft.group,
        currency: expenseDraft.currency,
        amount_minor: amount,
        reason: expenseDraft.reason.trim(),
        recorded_at: localInputToIso(expenseDraft.recordedAt),
      });
      await reload();
      setExpenseDraft(null);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function adjustExpense() {
    if (!token || !expenseDraft?.id || !expenseDraft.version) return;
    const amount = parseAmountToMinor(expenseDraft.amount, expenseDraft.currency);
    if (!expenseDraft.reason.trim() || amount == null) {
      setDialogError(t("form.amountInvalid"));
      return;
    }
    setSaving(true);
    setDialogError(null);
    try {
      await adjustAssetExpense(token, expenseDraft.id, {
        version: expenseDraft.version,
        amount_minor: amount,
        reason: expenseDraft.reason.trim(),
        recorded_at: localInputToIso(expenseDraft.recordedAt),
      });
      await reload();
      setExpenseDraft(null);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function archiveExpense(reason: string) {
    if (!token || !expenseDraft?.id || !expenseDraft.version) return;
    setSaving(true);
    try {
      await archiveAssetExpense(token, expenseDraft.id, { version: expenseDraft.version, reason });
      await reload();
      setExpenseDraft(null);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function saveDisplayCurrency(displayCurrency: string) {
    if (!token || !view || displayCurrency === view.profile.display_currency) return;
    setError(null);
    try {
      await updateAssetProfile(token, { version: view.profile.version, display_currency: displayCurrency });
      await reload();
    } catch (err) {
      setError(errorText(t, (err as { message?: string }).message ?? ""));
    }
  }

  async function saveRate(currency: string) {
    if (!token) return;
    const raw = (rates[currency] ?? "").trim();
    if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) <= 0) {
      setRateMessage(t("currency.rateInvalid"));
      return;
    }
    setRateMessage(null);
    try {
      await upsertFxRate(token, { currency, cny_per_unit: raw });
      await reload();
      setRateMessage(t("currency.saved"));
    } catch (err) {
      setRateMessage(errorText(t, (err as { message?: string }).message ?? ""));
    }
  }

  const summary = view?.summary;
  const display = summary?.display_currency ?? "CNY";
  const money = (amount: number) => formatMinor(amount, display, numberLocale);
  const assetGroups = view?.groups.filter((group) => group.kind === "asset") ?? [];
  const liabilityGroups = view?.groups.filter((group) => group.kind === "liability") ?? [];

  return (
    <PageMain>
      <div className="space-y-lg pb-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-subhead text-subhead text-text-primary">{t("title")}</h1>
            <p className="mt-1 max-w-2xl text-small text-text-secondary">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-2 text-small font-medium text-on-primary hover:bg-primary-hover"
            onClick={() => {
              setDialogError(null);
              setHoldingDraft(blankHolding("asset", "bank_deposit", "CNY", ""));
            }}
          >
            {t("add")}
          </button>
        </div>

        {error ? (
          <p className="rounded-xl border border-error-container bg-error-container/10 px-lg py-md text-small text-error">
            {error}
          </p>
        ) : null}
        {loading ? <p className="text-small text-text-secondary">{t("loading")}</p> : null}

        {summary ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label={t("summary.netWorth")} value={money(summary.net_worth_minor)} hint={t("summary.netWorthHint")} />
            <Stat label={t("summary.assets")} value={money(summary.total_assets_minor)} />
            <Stat label={t("summary.liabilities")} value={money(summary.total_liabilities_minor)} />
            <Stat label={t("summary.spendable")} value={money(summary.spendable_net_worth_minor)} hint={t("summary.spendableHint")} />
            <Stat label={t("summary.emergencyCash")} value={money(summary.emergency_cash_minor)} hint={t("summary.emergencyCashHint")} />
            <Stat label={t("summary.monthly")} value={money(summary.monthly_running_minor)} hint={t("summary.monthlyHint")} />
            <Stat label={t("summary.reserve")} value={money(summary.emergency_reserve_minor)} hint={t("summary.reserveHint")} />
            <Stat
              label={t("summary.coverage")}
              value={
                summary.coverage_months == null
                  ? t("summary.coverageUnset")
                  : t("summary.coverageMonths", { months: summary.coverage_months })
              }
            />
          </section>
        ) : null}

        {summary && summary.holding_count === 0 ? (
          <section className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
            <h2 className="text-small font-medium text-text-primary">{t("emptyTitle")}</h2>
            <p className="mt-2 max-w-2xl text-small text-text-secondary">{t("emptyBody")}</p>
            <p className="mt-3 text-caption text-text-secondary">{t("sameAccountHint")}</p>
          </section>
        ) : null}

        {summary ? (
          <p
            className={[
              "rounded-xl border px-lg py-md text-small",
              summary.focus === "credit" || summary.focus === "missing_fx"
                ? "border-error-container bg-error-container/10 text-error"
                : "border-indigo-100 bg-indigo-50 text-indigo-700",
            ].join(" ")}
          >
            {focusText(t, summary.focus)}
            {summary.missing_currencies.length > 0
              ? ` ${t("focus.missingList", { currencies: summary.missing_currencies.join("、") })}`
              : ""}
          </p>
        ) : null}

        {view ? (
          <section className="rounded-xl border border-border-subtle bg-white p-lg">
            <h2 className="text-small font-medium text-text-primary">{t("currency.title")}</h2>
            <p className="mt-1 text-caption text-text-secondary">{t("currency.hint")}</p>
            <label className="mt-4 block max-w-xs space-y-1">
              <span className={labelClass}>{t("currency.display")}</span>
              <select
                value={view.profile.display_currency}
                onChange={(event) => void saveDisplayCurrency(event.target.value)}
                className={fieldClass}
              >
                {BOOK_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {currencyLabel(t, code)}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 space-y-2">
              {RATE_CURRENCIES.map((code) => (
                <div key={code} className="flex flex-wrap items-center gap-2">
                  <label className="text-small text-text-secondary" htmlFor={`rate-${code}`}>
                    {t("currency.rate", { code })}
                  </label>
                  <input
                    id={`rate-${code}`}
                    inputMode="decimal"
                    value={rates[code] ?? ""}
                    onChange={(event) => setRates({ ...rates, [code]: event.target.value })}
                    className="w-32 rounded-xl border border-border-subtle bg-surface-bright px-3 py-2 text-small tabular-nums outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                  />
                  <button type="button" className="text-small text-primary" onClick={() => void saveRate(code)}>
                    {t("currency.save")}
                  </button>
                </div>
              ))}
            </div>
            {rateMessage ? <p className="mt-2 text-caption text-text-secondary">{rateMessage}</p> : null}
          </section>
        ) : null}

        <GroupList
          title={t("allocation.assets")}
          groups={assetGroups}
          display={display}
          locale={numberLocale}
          stampLocale={numberLocale}
          money={money}
          onOpen={(holding) => void openHolding(holding)}
          onAdd={() => {
            setDialogError(null);
            setHoldingDraft(blankHolding("asset", "bank_deposit", "CNY", ""));
          }}
        />
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_STARTERS.map((starter) => (
            <button
              key={starter.id}
              type="button"
              className="rounded-xl border border-border-subtle px-3 py-1.5 text-caption text-text-primary hover:bg-surface-container-lowest"
              onClick={() => {
                setDialogError(null);
                setHoldingDraft(blankHolding(starter.kind, starter.category, starter.currency, starterLabel(t, starter.id)));
              }}
            >
              {starterLabel(t, starter.id)}
            </button>
          ))}
        </div>

        <GroupList
          title={t("allocation.liabilities")}
          groups={liabilityGroups}
          display={display}
          locale={numberLocale}
          stampLocale={numberLocale}
          money={money}
          onOpen={(holding) => void openHolding(holding)}
          onAdd={() => {
            setDialogError(null);
            setHoldingDraft(blankHolding("liability", "credit_card", "CNY", ""));
          }}
          empty={t("columns.liabilitiesEmpty")}
        />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-small font-medium text-text-primary">{t("expense.title")}</h2>
            <button
              type="button"
              className="text-small text-primary"
              onClick={() => {
                setDialogError(null);
                setExpenseDraft(blankExpense("other", "CNY", ""));
              }}
            >
              {t("expense.add")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_STARTERS.map((starter) => (
              <button
                key={starter.id}
                type="button"
                className="rounded-xl border border-border-subtle px-3 py-1.5 text-caption hover:bg-surface-container-lowest"
                onClick={() => {
                  setDialogError(null);
                  setExpenseDraft(
                    blankExpense(starter.group, starter.currency, starterLabel(t, starter.id), starter.amount ?? ""),
                  );
                }}
              >
                {starterLabel(t, starter.id)}
              </button>
            ))}
          </div>
          {(view?.expense_groups ?? []).map((group) => (
            <details key={group.group_kind} open className="rounded-xl border border-border-subtle bg-white p-lg">
              <summary className="flex cursor-pointer items-center justify-between gap-3 text-small">
                <span>
                  <span className="font-medium text-text-primary">{groupLabel(t, group.group_kind)}</span>
                  <span className="mt-1 block text-caption text-text-secondary">{groupHint(t, group.group_kind)}</span>
                </span>
                <span className="tabular-nums text-text-primary">{money(group.display_minor)}</span>
              </summary>
              <ul className="mt-3 divide-y divide-border-subtle">
                {group.items.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p className="text-small text-text-primary">{item.name}</p>
                      <p className="text-caption text-text-secondary">
                        {formatStamp(item.adjusted_at, numberLocale)}
                        {item.latest_reason ? ` · ${item.latest_reason}` : ""}
                      </p>
                      {item.currency !== display || item.fx_missing ? (
                        <p className="text-caption text-text-secondary">
                          {item.fx_missing
                            ? t("holding.missingFx")
                            : t("holding.actual", { amount: formatMinor(item.amount_minor, item.currency, numberLocale) })}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-small tabular-nums">
                        {item.display_minor == null ? "—" : money(item.display_minor)}
                      </p>
                      <button type="button" className="text-caption text-primary" onClick={() => void openExpense(item)}>
                        {t("holding.adjust")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>

        <details className="rounded-xl border border-border-subtle bg-white p-lg">
          <summary className="cursor-pointer text-small font-medium text-text-primary">{t("principles.title")}</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-small text-text-secondary">
            <li>{t("principles.item1")}</li>
            <li>{t("principles.item2")}</li>
            <li>{t("principles.item3")}</li>
            <li>{t("principles.item4")}</li>
            <li>{t("principles.item5")}</li>
          </ul>
        </details>
      </div>

      {holdingDraft ? (
        <HoldingDialog
          draft={holdingDraft}
          displayCurrency={display}
          locale={numberLocale}
          saving={saving}
          error={dialogError}
          history={history}
          historyLoading={historyLoading}
          current={currentHolding}
          onChange={setHoldingDraft}
          onClose={() => {
            if (!saving) setHoldingDraft(null);
          }}
          onCreate={() => void createHolding()}
          onAdjust={() => void adjustHolding()}
          onSaveDetails={() => void saveHoldingDetails()}
          onArchive={(reason) => void archiveHolding(reason)}
        />
      ) : null}
      {expenseDraft ? (
        <ExpenseDialog
          draft={expenseDraft}
          locale={numberLocale}
          saving={saving}
          error={dialogError}
          history={history}
          current={currentExpense}
          onChange={setExpenseDraft}
          onClose={() => {
            if (!saving) setExpenseDraft(null);
          }}
          onCreate={() => void createExpense()}
          onAdjust={() => void adjustExpense()}
          onArchive={(reason) => void archiveExpense(reason)}
        />
      ) : null}
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

function GroupList({
  title,
  groups,
  display,
  locale,
  stampLocale,
  money,
  onOpen,
  onAdd,
  empty,
}: {
  title: string;
  groups: MyAssetsView["groups"];
  display: string;
  locale: string;
  stampLocale: string;
  money: (amount: number) => string;
  onOpen: (holding: AssetHolding) => void;
  onAdd: () => void;
  empty?: string;
}) {
  const t = useTranslations("assets");
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-small font-medium text-text-primary">{title}</h2>
        <button type="button" className="text-small text-primary" onClick={onAdd}>
          {t("add")}
        </button>
      </div>
      {groups.length === 0 && empty ? <p className="text-small text-text-secondary">{empty}</p> : null}
      {groups.map((group) => (
        <details key={group.category} open className="rounded-xl border border-border-subtle bg-white p-lg">
          <summary className="flex cursor-pointer items-center justify-between gap-3 text-small font-medium text-text-primary">
            <span>
              {categoryLabel(t, group.category)}
              {group.fx_incomplete ? (
                <span className="ml-2 text-caption font-normal text-error">{t("holding.missingFx")}</span>
              ) : null}
            </span>
            <span className="tabular-nums">{money(group.display_minor)}</span>
          </summary>
          <ul className="mt-2 divide-y divide-border-subtle">
            {group.holdings.map((holding) => (
              <li key={holding.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-small text-text-primary">{holding.name}</p>
                  <p className="text-caption text-text-secondary">
                    {holding.institution ? `${holding.institution} · ` : ""}
                    {formatStamp(holding.adjusted_at, stampLocale)}
                    {holding.latest_reason ? ` · ${holding.latest_reason}` : ""}
                  </p>
                  {holding.currency !== display || holding.fx_missing ? (
                    <p className="text-caption text-text-secondary">
                      {holding.fx_missing
                        ? `${t("holding.missingFx")} · ${formatMinor(holding.amount_minor, holding.currency, locale)}`
                        : t("holding.actual", {
                            amount: formatMinor(holding.amount_minor, holding.currency, locale),
                          })}
                    </p>
                  ) : null}
                  {!holding.include_in_net_worth ? (
                    <p className="text-caption text-text-secondary">{t("holding.excluded")}</p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-small tabular-nums text-text-primary">
                    {holding.display_minor == null ? "—" : money(holding.display_minor)}
                  </p>
                  <button type="button" className="text-caption text-primary" onClick={() => onOpen(holding)}>
                    {t("holding.adjust")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
