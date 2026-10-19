"use client";

import { useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import type { AccountStarter } from "@/components/assets/categories";
import { fieldClass, labelClass } from "@/components/assets/fields";
import { currencyDigits } from "@/lib/money";

export type OpenDraft = {
  partyId?: string;
  partyName: string;
  institutionKind: string;
  accountId?: string;
  accountName: string;
  accountKind: string;
  cardNumber: string;
  assetAccountNo: string;
  accountNumber: string;
  balanceName: string;
  category: string;
  currency: string;
  amount: string;
  reason: string;
  recordedAt: string;
};

const CURRENCIES = ["CNY", "HKD", "JPY", "KRW", "USD", "EUR", "GBP"];

export function draftFromStarter(
  starter: AccountStarter,
  name: string,
  recordedAt: string,
): OpenDraft {
  return {
    partyName: starter.partyName,
    institutionKind: starter.institutionKind,
    accountName: starter.accountName,
    accountKind: starter.accountKind,
    cardNumber: "",
    assetAccountNo: "",
    accountNumber: "",
    balanceName: name,
    category: starter.category,
    currency: starter.currency,
    amount: "",
    reason: "",
    recordedAt,
  };
}

type OpenBookDialogProps = {
  draft: OpenDraft;
  saving: boolean;
  error: string | null;
  onChange: (draft: OpenDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
};

export function OpenBookDialog({ draft, saving, error, onChange, onClose, onSubmit }: OpenBookDialogProps) {
  const t = useTranslations("assets");
  const titleId = useId();
  const addingCurrency = Boolean(draft.accountId);
  const needsCard = draft.accountKind === "debit_card" || draft.accountKind === "credit_card";
  const needsAssetNo = draft.accountKind === "securities";
  const digits = currencyDigits(draft.currency);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  return (
    <div className="fixed inset-0 z-50">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label={t("form.close")} onClick={onClose} />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-[calc(100vh-2rem)] w-[min(36rem,calc(100vw-2rem))] space-y-4 overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-xl"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-subhead text-subhead text-text-primary">
              {addingCurrency ? t("tree.addCurrency") : t("form.createTitle")}
            </h2>
            <button type="button" className="text-small text-text-secondary" onClick={onClose}>
              {t("form.close")}
            </button>
          </div>
          {addingCurrency ? null : (
            <>
              <label className="block space-y-1">
                <span className={labelClass}>{t("form.partyName")}</span>
                <input
                  required
                  maxLength={80}
                  value={draft.partyName}
                  disabled={Boolean(draft.partyId)}
                  onChange={(event) => onChange({ ...draft, partyName: event.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>{t("form.accountName")}</span>
                <input
                  required
                  maxLength={80}
                  value={draft.accountName}
                  onChange={(event) => onChange({ ...draft, accountName: event.target.value })}
                  className={fieldClass}
                />
              </label>
              {needsCard ? (
                <label className="block space-y-1">
                  <span className={labelClass}>{t("form.cardNumber")}</span>
                  <input
                    required
                    inputMode="numeric"
                    autoComplete="off"
                    value={draft.cardNumber}
                    onChange={(event) => onChange({ ...draft, cardNumber: event.target.value })}
                    className={`${fieldClass} tabular-nums`}
                  />
                </label>
              ) : null}
              {needsAssetNo ? (
                <label className="block space-y-1">
                  <span className={labelClass}>{t("form.assetAccountNo")}</span>
                  <input
                    required
                    autoComplete="off"
                    value={draft.assetAccountNo}
                    onChange={(event) => onChange({ ...draft, assetAccountNo: event.target.value })}
                    className={`${fieldClass} tabular-nums`}
                  />
                </label>
              ) : null}
              {!needsCard && !needsAssetNo ? (
                <label className="block space-y-1">
                  <span className={labelClass}>{t("form.accountNumber")}</span>
                  <input
                    autoComplete="off"
                    value={draft.accountNumber}
                    onChange={(event) => onChange({ ...draft, accountNumber: event.target.value })}
                    className={fieldClass}
                  />
                </label>
              ) : null}
            </>
          )}
          {addingCurrency && draft.accountKind === "securities" ? (
            <label className="block space-y-1">
              <span className={labelClass}>{t("form.category")}</span>
              <select
                value={draft.category}
                onChange={(event) => onChange({ ...draft, category: event.target.value })}
                className={fieldClass}
              >
                <option value="a_share">{t("categories.a_share")}</option>
                <option value="hk_share">{t("categories.hk_share")}</option>
              </select>
            </label>
          ) : null}
          <label className="block space-y-1">
            <span className={labelClass}>{t("form.balanceName")}</span>
            <input
              required
              maxLength={80}
              value={draft.balanceName}
              onChange={(event) => onChange({ ...draft, balanceName: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>{t("form.currency")}</span>
            <select
              value={draft.currency}
              onChange={(event) => onChange({ ...draft, currency: event.target.value })}
              className={fieldClass}
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>
              {t("form.amount")} <span className="font-normal">{draft.currency}</span>
            </span>
            <input
              required
              inputMode="decimal"
              value={draft.amount}
              placeholder={digits === 0 ? "0" : "0.00"}
              onChange={(event) => onChange({ ...draft, amount: event.target.value })}
              className={`${fieldClass} tabular-nums`}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>{t("form.reason")}</span>
            <input
              required
              maxLength={200}
              value={draft.reason}
              onChange={(event) => onChange({ ...draft, reason: event.target.value })}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>{t("form.recordedAt")}</span>
            <input
              required
              type="datetime-local"
              value={draft.recordedAt}
              onChange={(event) => onChange({ ...draft, recordedAt: event.target.value })}
              className={fieldClass}
            />
          </label>
          {error ? <p className="text-small text-error">{error}</p> : null}
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-small font-medium text-on-primary disabled:opacity-50"
              disabled={saving}
            >
              {saving ? t("form.saving") : t("form.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
