"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { categoryBarClass, categoriesFor, type AssetKind } from "@/components/assets/categories";
import {
  categoryLabel,
  currencyLabel,
  debtBandLabel,
  emergencyBandLabel,
  errorText,
  focusText,
} from "@/components/assets/copy";
import { HoldingFormDialog, type HoldingDraft } from "@/components/assets/HoldingFormDialog";
import { PageMain } from "@/components/layout";
import {
  archiveAssetHolding,
  confirmAssetHolding,
  createAssetHolding,
  fetchMyAssets,
  updateAssetHolding,
  updateAssetProfile,
} from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { htmlLang, type Locale } from "@/i18n/config";
import { formatMinor, localToday, minorToInput, parseAmountToMinor } from "@/lib/money";
import type { AssetHolding, MyAssetsView, NetWorthPoint } from "@/types/api/views/assets";

const CURRENCIES = ["CNY", "USD", "HKD", "EUR", "GBP", "JPY"] as const;
const PRINCIPLES = ["item1", "item2", "item3", "item4", "item5"] as const;

function formatDay(iso: string, locale: Locale): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat(htmlLang(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function blankDraft(kind: AssetKind, category: string, name: string): HoldingDraft {
  return {
    mode: "create",
    name,
    kind,
    category,
    amount: "",
    institution: "",
    note: "",
    asOf: localToday(),
    includeInNetWorth: true,
  };
}

function draftFromHolding(holding: AssetHolding, currency: string): HoldingDraft {
  return {
    mode: "edit",
    id: holding.id,
    version: holding.version,
    name: holding.name,
    kind: holding.kind,
    category: holding.category,
    amount: minorToInput(holding.amount_minor, currency),
    institution: holding.institution ?? "",
    note: holding.note ?? "",
    asOf: holding.as_of,
    includeInNetWorth: holding.include_in_net_worth,
  };
}

function NetWorthLine({
  points,
  currency,
  locale,
  label,
}: {
  points: NetWorthPoint[];
  currency: string;
  locale: string;
  label: string;
}) {
  if (points.length < 2) return null;
  const values = points.map((point) => point.net_worth_minor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 320;
  const height = 72;
  const coords = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * (width - 8) + 4;
      const y = height - 8 - ((value - min) / span) * (height - 16);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full text-primary" role="img" aria-label={label}>
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={coords} />
      <title>
        {formatMinor(values[0] ?? 0, currency, locale)} – {formatMinor(values[values.length - 1] ?? 0, currency, locale)}
      </title>
    </svg>
  );
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
  const [draft, setDraft] = useState<HoldingDraft | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const [currency, setCurrency] = useState("CNY");
  const [essential, setEssential] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  const load = useCallback(async (accessToken: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchMyAssets(accessToken);
      setView(next);
    } catch (err) {
      setError(errorText(t, (err as { message?: string }).message ?? ""));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const accessToken = getToken();
    if (!accessToken) {
      router.push("/login");
      return;
    }
    setToken(accessToken);
    setToday(localToday());
    void load(accessToken);
  }, [load, router]);

  useEffect(() => {
    if (!view) return;
    setCurrency(view.profile.currency);
    setEssential(
      view.profile.monthly_essential_minor == null
        ? ""
        : minorToInput(view.profile.monthly_essential_minor, view.profile.currency),
    );
  }, [view]);

  async function reloadAfterWrite() {
    if (!token) return;
    const next = await fetchMyAssets(token);
    setView(next);
  }

  async function submitHolding() {
    if (!token || !draft || !view) return;
    const name = draft.name.trim();
    if (!name) {
      setDialogError(t("errors.name_required"));
      return;
    }
    const bookCurrency =
      draft.mode === "create" && !view.profile.currency_locked ? currency : view.profile.currency;
    const amount = parseAmountToMinor(draft.amount, bookCurrency);
    if (amount == null) {
      setDialogError(t("form.amountInvalid"));
      return;
    }
    setSaving(true);
    setDialogError(null);
    const body = {
      name,
      kind: draft.kind,
      category: draft.category,
      amount_minor: amount,
      institution: draft.institution.trim() || null,
      note: draft.note.trim() || null,
      as_of: draft.asOf,
      include_in_net_worth: draft.includeInNetWorth,
    };
    try {
      if (
        draft.mode === "create" &&
        !view.profile.currency_locked &&
        currency !== view.profile.currency
      ) {
        await updateAssetProfile(token, {
          version: view.profile.version,
          currency,
        });
      }
      if (draft.mode === "create") {
        await createAssetHolding(token, body);
      } else if (draft.id && draft.version) {
        await updateAssetHolding(token, draft.id, { ...body, version: draft.version });
      }
      await reloadAfterWrite();
      setDraft(null);
    } catch (err) {
      const message = (err as { message?: string }).message ?? "";
      if (message === "version_conflict") await reloadAfterWrite();
      setDialogError(errorText(t, message));
    } finally {
      setSaving(false);
    }
  }

  async function archiveHolding() {
    if (!token || !draft?.id || !draft.version) return;
    setSaving(true);
    setDialogError(null);
    try {
      await archiveAssetHolding(token, draft.id, draft.version);
      await reloadAfterWrite();
      setDraft(null);
    } catch (err) {
      const message = (err as { message?: string }).message ?? "";
      if (message === "version_conflict") await reloadAfterWrite();
      setDialogError(errorText(t, message));
    } finally {
      setSaving(false);
    }
  }

  async function confirmHolding(holding: AssetHolding) {
    if (!token || !today) return;
    setError(null);
    try {
      await confirmAssetHolding(token, holding.id, { version: holding.version, as_of: today });
      await reloadAfterWrite();
    } catch (err) {
      const message = (err as { message?: string }).message ?? "";
      if (message === "version_conflict") await reloadAfterWrite();
      setError(errorText(t, message));
    }
  }

  async function saveProfile() {
    if (!token || !view) return;
    const bookCurrency = view.profile.currency_locked ? view.profile.currency : currency;
    let monthly: number | null = null;
    if (essential.trim()) {
      const parsed = parseAmountToMinor(essential, bookCurrency);
      if (parsed == null || parsed <= 0) {
        setProfileError(t("form.amountInvalid"));
        setProfileSaved(false);
        return;
      }
      monthly = parsed;
    }
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      await updateAssetProfile(token, {
        version: view.profile.version,
        currency: view.profile.currency_locked ? undefined : currency,
        monthly_essential_minor: monthly,
      });
      await reloadAfterWrite();
      setProfileSaved(true);
    } catch (err) {
      const message = (err as { message?: string }).message ?? "";
      if (message === "version_conflict") await reloadAfterWrite();
      setProfileError(errorText(t, message));
    } finally {
      setProfileSaving(false);
    }
  }

  const summary = view?.summary;
  const bookCurrency = view?.profile.currency ?? "CNY";
  const money = (amount: number) => formatMinor(amount, bookCurrency, numberLocale);
  const empty = !loading && !error && summary?.holding_count === 0;

  function openCreate(kind: AssetKind, category: string, name = "") {
    setDialogError(null);
    setDraft(blankDraft(kind, category, name));
  }

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
            onClick={() => openCreate("asset", "cash")}
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

        {empty ? (
          <section className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
            <h2 className="font-section-heading text-text-primary">{t("emptyTitle")}</h2>
            <p className="mt-2 max-w-2xl text-small text-text-secondary">{t("emptyBody")}</p>
            <p className="mt-4 text-caption text-neutral-muted">{t("starterHint")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["asset", "cash", t("starters.cash")],
                  ["asset", "investment", t("starters.investment")],
                  ["asset", "property", t("starters.property")],
                  ["liability", "credit", t("starters.credit")],
                  ["liability", "mortgage", t("starters.mortgage")],
                ] as const
              ).map(([kind, category, name]) => (
                <button
                  key={category}
                  type="button"
                  className="rounded-xl border border-border-subtle px-3 py-2 text-small text-text-primary hover:bg-surface-container-lowest"
                  onClick={() => openCreate(kind, category, name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {summary && summary.holding_count > 0 ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm sm:col-span-2 xl:col-span-1">
                <p className="text-overline text-neutral-muted">{t("summary.netWorth")}</p>
                <p className="mt-2 font-display text-2xl tabular-nums text-text-primary">{money(summary.net_worth_minor)}</p>
                <p className="mt-1 text-caption text-text-secondary">{t("summary.netWorthHint")}</p>
              </article>
              <article className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
                <p className="text-overline text-neutral-muted">{t("summary.assets")}</p>
                <p className="mt-2 text-xl tabular-nums text-text-primary">{money(summary.total_assets_minor)}</p>
              </article>
              <article className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
                <p className="text-overline text-neutral-muted">{t("summary.liabilities")}</p>
                <p className="mt-2 text-xl tabular-nums text-text-primary">{money(summary.total_liabilities_minor)}</p>
              </article>
              <article className="rounded-xl border border-border-subtle bg-white p-lg shadow-sm">
                <p className="text-overline text-neutral-muted">{t("summary.liquid")}</p>
                <p className="mt-2 text-xl tabular-nums text-text-primary">{money(summary.liquid_net_worth_minor)}</p>
                <p className="mt-1 text-caption text-text-secondary">{t("summary.liquidHint")}</p>
              </article>
            </section>

            <p
              className={[
                "rounded-xl border px-lg py-md text-small",
                summary.focus === "high_interest"
                  ? "border-error-container bg-error-container/10 text-error"
                  : "border-indigo-100 bg-indigo-50 text-indigo-950",
              ].join(" ")}
            >
              {focusText(t, summary.focus)}
            </p>

            <section className="grid gap-3 md:grid-cols-3">
              <article className="rounded-xl border border-border-subtle bg-white p-lg">
                <p className="text-overline text-neutral-muted">{t("metrics.emergency")}</p>
                <p className="mt-2 text-body tabular-nums text-text-primary">
                  {summary.emergency_months == null
                    ? t("metrics.emergencyUnset")
                    : t("metrics.emergencyMonths", { months: summary.emergency_months })}
                </p>
                <p className="mt-1 text-caption text-text-secondary">
                  {emergencyBandLabel(t, summary.emergency_band)}
                </p>
              </article>
              <article className="rounded-xl border border-border-subtle bg-white p-lg">
                <p className="text-overline text-neutral-muted">{t("metrics.debtRatio")}</p>
                <p className="mt-2 text-body tabular-nums text-text-primary">
                  {summary.debt_ratio == null
                    ? t("metrics.debtUnset")
                    : new Intl.NumberFormat(numberLocale, { style: "percent", maximumFractionDigits: 1 }).format(
                        summary.debt_ratio,
                      )}
                </p>
                <p className="mt-1 text-caption text-text-secondary">{debtBandLabel(t, summary.debt_band)}</p>
              </article>
              <article className="rounded-xl border border-border-subtle bg-white p-lg">
                <p className="text-overline text-neutral-muted">{t("metrics.review")}</p>
                <p className="mt-2 text-body text-text-primary">
                  {summary.needs_review_count > 0
                    ? t("metrics.reviewCount", { count: summary.needs_review_count })
                    : t("metrics.reviewClear")}
                </p>
                {summary.latest_as_of ? (
                  <p className="mt-1 text-caption text-text-secondary">
                    {t("summary.latest", { date: formatDay(summary.latest_as_of, locale) })}
                  </p>
                ) : null}
              </article>
            </section>

            <AllocationBars view={view!} money={money} />

            {view && view.net_worth_series.length >= 2 ? (
              <section className="rounded-xl border border-border-subtle bg-white p-lg">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-small font-medium text-text-primary">{t("series.title")}</h2>
                  <p className="text-caption text-text-secondary">
                    {formatDay(view.net_worth_series[0]?.as_of ?? "", locale)} –{" "}
                    {formatDay(view.net_worth_series[view.net_worth_series.length - 1]?.as_of ?? "", locale)}
                  </p>
                </div>
                <NetWorthLine
                  points={view.net_worth_series}
                  currency={bookCurrency}
                  locale={numberLocale}
                  label={t("series.aria", {
                    start: formatDay(view.net_worth_series[0]?.as_of ?? "", locale),
                    end: formatDay(view.net_worth_series[view.net_worth_series.length - 1]?.as_of ?? "", locale),
                  })}
                />
                <p className="text-caption text-text-secondary">{t("series.caption")}</p>
              </section>
            ) : null}

            <section className="grid gap-lg lg:grid-cols-2">
              <HoldingColumn
                kind="asset"
                title={t("columns.assets")}
                empty={t("columns.assetsEmpty")}
                holdings={view?.holdings.filter((row) => row.kind === "asset") ?? []}
                currency={bookCurrency}
                locale={locale}
                numberLocale={numberLocale}
                today={today}
                onEdit={(holding) => {
                  setDialogError(null);
                  setDraft(draftFromHolding(holding, bookCurrency));
                }}
                onConfirm={(holding) => void confirmHolding(holding)}
                onAdd={() => openCreate("asset", "cash")}
              />
              <HoldingColumn
                kind="liability"
                title={t("columns.liabilities")}
                empty={t("columns.liabilitiesEmpty")}
                holdings={view?.holdings.filter((row) => row.kind === "liability") ?? []}
                currency={bookCurrency}
                locale={locale}
                numberLocale={numberLocale}
                today={today}
                onEdit={(holding) => {
                  setDialogError(null);
                  setDraft(draftFromHolding(holding, bookCurrency));
                }}
                onConfirm={(holding) => void confirmHolding(holding)}
                onAdd={() => openCreate("liability", "credit")}
              />
            </section>
          </>
        ) : null}

        {view ? (
          <section className="rounded-xl border border-border-subtle bg-white p-lg">
            <h2 className="text-small font-medium text-text-primary">{t("profile.title")}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-small font-medium text-on-surface-variant">{t("profile.currency")}</span>
                <select
                  value={currency}
                  disabled={view.profile.currency_locked || profileSaving}
                  onChange={(event) => {
                    setCurrency(event.target.value);
                    setProfileSaved(false);
                  }}
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:opacity-50"
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {currencyLabel(t, code)}
                    </option>
                  ))}
                </select>
                <span className="block text-caption text-text-secondary">
                  {view.profile.currency_locked ? t("profile.currencyLocked") : t("profile.currencyHint")}
                </span>
              </label>
              <label className="block space-y-1">
                <span className="text-small font-medium text-on-surface-variant">{t("profile.essential")}</span>
                <input
                  inputMode="decimal"
                  value={essential}
                  onChange={(event) => {
                    setEssential(event.target.value);
                    setProfileSaved(false);
                  }}
                  placeholder={bookCurrency === "JPY" ? "0" : "0.00"}
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body tabular-nums outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
                <span className="block text-caption text-text-secondary">{t("profile.essentialHint")}</span>
              </label>
            </div>
            {profileError ? <p className="mt-3 text-small text-error">{profileError}</p> : null}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                className="rounded-xl bg-primary px-4 py-2 text-small font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                onClick={() => void saveProfile()}
                disabled={profileSaving}
              >
                {profileSaving ? t("profile.saving") : t("profile.save")}
              </button>
              {profileSaved ? <span className="text-small text-text-secondary">{t("profile.saved")}</span> : null}
            </div>
          </section>
        ) : null}

        <details
          key={empty ? "guide-open" : "guide"}
          className="rounded-xl border border-border-subtle bg-white p-lg"
          {...(empty ? { open: true } : {})}
        >
          <summary className="cursor-pointer text-small font-medium text-text-primary">{t("principles.title")}</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-small text-text-secondary">
            {PRINCIPLES.map((key) => (
              <li key={key}>{t(`principles.${key}`)}</li>
            ))}
          </ul>
        </details>
      </div>

      {draft && view ? (
        <HoldingFormDialog
          draft={draft}
          currency={view.profile.currency_locked ? view.profile.currency : currency}
          saving={saving}
          error={dialogError}
          onChange={setDraft}
          onClose={() => {
            if (!saving) setDraft(null);
          }}
          onSubmit={() => void submitHolding()}
          onArchive={() => void archiveHolding()}
        />
      ) : null}
    </PageMain>
  );
}

function AllocationBars({
  view,
  money,
}: {
  view: MyAssetsView;
  money: (amount: number) => string;
}) {
  const t = useTranslations("assets");
  return (
    <section className="grid gap-lg lg:grid-cols-2">
      {(["asset", "liability"] as const).map((kind) => {
        const slices = view.allocation.filter((slice) => slice.kind === kind);
        if (slices.length === 0) return null;
        return (
          <div key={kind} className="rounded-xl border border-border-subtle bg-white p-lg">
            <h2 className="text-small font-medium text-text-primary">
              {kind === "asset" ? t("allocation.assets") : t("allocation.liabilities")}
            </h2>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-zinc-100">
              {slices.map((slice) => (
                <div
                  key={slice.category}
                  className={categoryBarClass(slice.category)}
                  style={{ width: `${Math.max(slice.share * 100, 1)}%` }}
                  title={`${categoryLabel(t, slice.category)} ${money(slice.amount_minor)}`}
                />
              ))}
            </div>
            <ul className="mt-3 space-y-1">
              {slices.map((slice) => (
                <li key={slice.category} className="flex items-center justify-between gap-3 text-small">
                  <span className="flex items-center gap-2 text-text-secondary">
                    <span className={`h-2 w-2 rounded-full ${categoryBarClass(slice.category)}`} />
                    {categoryLabel(t, slice.category)}
                  </span>
                  <span className="tabular-nums text-text-primary">{money(slice.amount_minor)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function HoldingColumn({
  kind,
  title,
  empty,
  holdings,
  currency,
  locale,
  numberLocale,
  today,
  onEdit,
  onConfirm,
  onAdd,
}: {
  kind: AssetKind;
  title: string;
  empty: string;
  holdings: AssetHolding[];
  currency: string;
  locale: Locale;
  numberLocale: string;
  today: string | null;
  onEdit: (holding: AssetHolding) => void;
  onConfirm: (holding: AssetHolding) => void;
  onAdd: () => void;
}) {
  const t = useTranslations("assets");
  const groups = categoriesFor(kind)
    .map((category) => ({
      category,
      rows: holdings.filter((row) => row.category === category),
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <section className="rounded-xl border border-border-subtle bg-white p-lg">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-small font-medium text-text-primary">{title}</h2>
        <button type="button" className="text-small text-primary hover:underline" onClick={onAdd}>
          {t("add")}
        </button>
      </div>
      {groups.length === 0 ? <p className="mt-3 text-small text-text-secondary">{empty}</p> : null}
      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <div key={group.category}>
            <p className="text-overline text-neutral-muted">{categoryLabel(t, group.category)}</p>
            <ul className="mt-1 divide-y divide-border-subtle">
              {group.rows.map((holding) => (
                <li key={holding.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-small text-text-primary">{holding.name}</p>
                    <p className="mt-0.5 text-caption text-text-secondary">
                      {holding.institution ? `${holding.institution} · ` : ""}
                      {t("holding.asOf", { date: formatDay(holding.as_of, locale) })}
                    </p>
                    {holding.note ? (
                      <p className="mt-1 line-clamp-2 text-caption text-text-secondary">{holding.note}</p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-2">
                      {holding.needs_review ? (
                        <span className="rounded-md border border-error-container px-1.5 py-0.5 text-caption text-error">
                          {t("holding.review")}
                        </span>
                      ) : null}
                      {!holding.include_in_net_worth ? (
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-caption text-text-secondary">
                          {t("holding.excluded")}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="text-small tabular-nums text-text-primary">
                      {formatMinor(holding.amount_minor, currency, numberLocale)}
                    </p>
                    <div className="flex gap-2">
                      {today && holding.as_of !== today ? (
                        <button
                          type="button"
                          className="text-caption text-text-secondary hover:text-text-primary hover:underline"
                          onClick={() => onConfirm(holding)}
                        >
                          {t("holding.confirm")}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-caption text-primary hover:underline"
                        onClick={() => onEdit(holding)}
                      >
                        {t("holding.edit")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
