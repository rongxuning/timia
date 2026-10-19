"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { categoriesFor, type AssetKind } from "@/components/assets/categories";
import { categoryHint, categoryLabel, kindLabel } from "@/components/assets/copy";
import { fieldClass, labelClass } from "@/components/assets/fields";
import { currencyDigits, formatMinor, formatStamp, minorToInput } from "@/lib/money";
import type { AssetAdjustment, AssetHolding } from "@/types/api/views/assets";

export type HoldingDraft = {
  mode: "create" | "adjust";
  id?: string;
  version?: number;
  name: string;
  kind: AssetKind;
  category: string;
  currency: string;
  amount: string;
  institution: string;
  note: string;
  includeInNetWorth: boolean;
  reason: string;
  recordedAt: string;
};

type HoldingDialogProps = {
  draft: HoldingDraft;
  displayCurrency: string;
  locale: string;
  saving: boolean;
  error: string | null;
  history: AssetAdjustment[];
  historyLoading: boolean;
  current: AssetHolding | null;
  onChange: (draft: HoldingDraft) => void;
  onClose: () => void;
  onCreate: () => void;
  onAdjust: () => void;
  onSaveDetails: () => void;
  onArchive: (reason: string) => void;
};

export function HoldingDialog({
  draft,
  displayCurrency,
  locale,
  saving,
  error,
  history,
  historyLoading,
  current,
  onChange,
  onClose,
  onCreate,
  onAdjust,
  onSaveDetails,
  onArchive,
}: HoldingDialogProps) {
  const t = useTranslations("assets");
  const titleId = useId();
  const [archiveReason, setArchiveReason] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);
  const categories = categoriesFor(draft.kind);
  const digits = currencyDigits(draft.currency);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  function setKind(kind: AssetKind) {
    const next = categoriesFor(kind);
    const category = next.includes(draft.category as (typeof next)[number]) ? draft.category : next[0];
    onChange({ ...draft, kind, category });
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label={t("form.close")}
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-[calc(100vh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-subhead text-subhead text-text-primary">
              {draft.mode === "create" ? t("form.createTitle") : draft.name}
            </h2>
            <button
              type="button"
              className="rounded-xl border border-border-subtle px-3 py-1.5 text-small text-text-secondary"
              onClick={onClose}
              disabled={saving}
            >
              {t("form.close")}
            </button>
          </div>

          {draft.mode === "create" ? (
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                onCreate();
              }}
            >
              <fieldset className="space-y-2">
                <legend className={labelClass}>{t("form.kind")}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["asset", "liability"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      aria-pressed={draft.kind === kind}
                      className={[
                        "rounded-xl border px-3 py-2 text-small",
                        draft.kind === kind
                          ? "border-primary bg-indigo-50 text-indigo-700"
                          : "border-border-subtle text-text-secondary",
                      ].join(" ")}
                      onClick={() => setKind(kind)}
                    >
                      {kindLabel(t, kind)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block space-y-1">
                <span className={labelClass}>{t("form.name")}</span>
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={draft.name}
                  onChange={(event) => onChange({ ...draft, name: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className={labelClass}>{t("form.category")}</span>
                  <select
                    value={draft.category}
                    onChange={(event) => onChange({ ...draft, category: event.target.value })}
                    className={fieldClass}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(t, category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>{t("form.currency")}</span>
                  <select
                    value={draft.currency}
                    onChange={(event) => onChange({ ...draft, currency: event.target.value })}
                    className={fieldClass}
                  >
                    {["CNY", "HKD", "JPY", "KRW", "USD", "EUR", "GBP"].map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-caption text-text-secondary">{categoryHint(t, draft.category)}</p>
              <AmountReasonFields
                amount={draft.amount}
                currency={draft.currency}
                digits={digits}
                reason={draft.reason}
                recordedAt={draft.recordedAt}
                onAmount={(amount) => onChange({ ...draft, amount })}
                onReason={(reason) => onChange({ ...draft, reason })}
                onTime={(recordedAt) => onChange({ ...draft, recordedAt })}
              />
              <label className="block space-y-1">
                <span className={labelClass}>{t("form.institution")}</span>
                <input
                  maxLength={80}
                  value={draft.institution}
                  onChange={(event) => onChange({ ...draft, institution: event.target.value })}
                  className={fieldClass}
                />
              </label>
              {error ? <p className="text-small text-error">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-xl border border-border-subtle px-4 py-2 text-small" onClick={onClose}>
                  {t("form.cancel")}
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-4 py-2 text-small font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? t("form.saving") : t("form.save")}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-5 space-y-5">
              <p className="text-caption text-text-secondary">
                {t("form.savedAs", { currency: draft.currency })}
                {draft.currency !== displayCurrency ? ` · ${t("form.displayIs", { currency: displayCurrency })}` : ""}
              </p>
              {current ? (
                <p className="text-body tabular-nums text-text-primary">
                  {formatMinor(current.amount_minor, current.currency, locale)}
                </p>
              ) : null}
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  onAdjust();
                }}
              >
                <AmountReasonFields
                  amount={draft.amount}
                  currency={draft.currency}
                  digits={digits}
                  reason={draft.reason}
                  recordedAt={draft.recordedAt}
                  onAmount={(amount) => onChange({ ...draft, amount })}
                  onReason={(reason) => onChange({ ...draft, reason })}
                  onTime={(recordedAt) => onChange({ ...draft, recordedAt })}
                />
                {error ? <p className="text-small text-error">{error}</p> : null}
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-4 py-2 text-small font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? t("form.saving") : t("form.recordAdjustment")}
                </button>
              </form>

              <form
                className="space-y-3 border-t border-border-subtle pt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveDetails();
                }}
              >
                <p className="text-small font-medium text-text-primary">{t("form.details")}</p>
                <label className="block space-y-1">
                  <span className={labelClass}>{t("form.name")}</span>
                  <input
                    required
                    maxLength={80}
                    value={draft.name}
                    onChange={(event) => onChange({ ...draft, name: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>{t("form.category")}</span>
                  <select
                    value={draft.category}
                    onChange={(event) => onChange({ ...draft, category: event.target.value })}
                    className={fieldClass}
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(t, category)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>{t("form.institution")}</span>
                  <input
                    maxLength={80}
                    value={draft.institution}
                    onChange={(event) => onChange({ ...draft, institution: event.target.value })}
                    className={fieldClass}
                  />
                </label>
                <label className="flex items-start gap-2 text-small">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={draft.includeInNetWorth}
                    onChange={(event) => onChange({ ...draft, includeInNetWorth: event.target.checked })}
                  />
                  <span>{t("form.include")}</span>
                </label>
                <button
                  type="submit"
                  className="rounded-xl border border-border-subtle px-4 py-2 text-small disabled:opacity-50"
                  disabled={saving}
                >
                  {t("form.saveDetails")}
                </button>
              </form>

              <div>
                <p className="text-small font-medium text-text-primary">{t("form.history")}</p>
                {historyLoading ? <p className="mt-2 text-caption text-text-secondary">{t("loading")}</p> : null}
                <ul className="mt-2 divide-y divide-border-subtle">
                  {history.map((row) => (
                    <li key={row.id} className="py-2 text-small">
                      <p className="text-text-primary">{row.reason}</p>
                      <p className="text-caption tabular-nums text-text-secondary">
                        {formatStamp(row.recorded_at, locale)}
                        {" · "}
                        {formatMinor(row.amount_minor, draft.currency, locale)}
                        {" · "}
                        {t("holding.delta", {
                          amount: formatMinor(Math.abs(row.delta_minor), draft.currency, locale),
                          sign: row.delta_minor > 0 ? "+" : row.delta_minor < 0 ? "−" : "",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {confirmArchive ? (
                <form
                  className="space-y-2 border-t border-border-subtle pt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onArchive(archiveReason.trim());
                  }}
                >
                  <label className="block space-y-1">
                    <span className={labelClass}>{t("form.archiveReason")}</span>
                    <input
                      required
                      maxLength={200}
                      value={archiveReason}
                      onChange={(event) => setArchiveReason(event.target.value)}
                      className={fieldClass}
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-xl bg-red-600 px-4 py-2 text-small text-white disabled:opacity-50"
                    disabled={saving}
                  >
                    {saving ? t("form.archiving") : t("form.archiveConfirm")}
                  </button>
                </form>
              ) : (
                <button type="button" className="text-small text-error" onClick={() => setConfirmArchive(true)}>
                  {t("form.archive")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AmountReasonFields({
  amount,
  currency,
  digits,
  reason,
  recordedAt,
  onAmount,
  onReason,
  onTime,
}: {
  amount: string;
  currency: string;
  digits: number;
  reason: string;
  recordedAt: string;
  onAmount: (value: string) => void;
  onReason: (value: string) => void;
  onTime: (value: string) => void;
}) {
  const t = useTranslations("assets");
  return (
    <>
      <label className="block space-y-1">
        <span className={labelClass}>
          {t("form.amount")} <span className="font-normal text-text-secondary">{currency}</span>
        </span>
        <input
          inputMode="decimal"
          required
          value={amount}
          placeholder={digits === 0 ? "0" : "0.00"}
          onChange={(event) => onAmount(event.target.value)}
          className={`${fieldClass} tabular-nums`}
        />
      </label>
      <label className="block space-y-1">
        <span className={labelClass}>{t("form.reason")}</span>
        <input
          required
          maxLength={200}
          value={reason}
          onChange={(event) => onReason(event.target.value)}
          className={fieldClass}
        />
      </label>
      <label className="block space-y-1">
        <span className={labelClass}>{t("form.recordedAt")}</span>
        <input
          type="datetime-local"
          required
          value={recordedAt}
          onChange={(event) => onTime(event.target.value)}
          className={fieldClass}
        />
      </label>
    </>
  );
}

export function amountInputFor(holding: AssetHolding): string {
  return minorToInput(holding.amount_minor, holding.currency);
}
