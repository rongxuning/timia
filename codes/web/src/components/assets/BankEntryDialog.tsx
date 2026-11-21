"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { errorText } from "@/components/assets/copy";
import { fieldClass, labelClass } from "@/components/assets/fields";
import {
  createBankCreditBill,
  createBankInvestmentOp,
  createBankProduct,
  createBankSavingsTxn,
} from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { localInputToIso, minorToInput, nowLocalInput, parseAmountToMinor } from "@/lib/money";
import type { BankProduct, BankProductKind } from "@/types/api/views/bank";

export type BankDialogMode = "create" | "savings" | "investment" | "credit";

const PRODUCT_KINDS = ["savings", "investment", "credit"] as const satisfies readonly BankProductKind[];

type BankEntryDialogProps = {
  accountId: string;
  mode: BankDialogMode;
  product: BankProduct | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function BankEntryDialog({ accountId, mode, product, onClose, onSaved }: BankEntryDialogProps) {
  const t = useTranslations("assets");
  const titleId = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BankProductKind>("savings");
  const [currency] = useState("CNY");
  const [balance, setBalance] = useState("");
  const [value, setValue] = useState("");
  const [cost, setCost] = useState("");
  const [limit, setLimit] = useState("");
  const [statement, setStatement] = useState("");
  const [paidOff, setPaidOff] = useState(false);
  const [yearMonth, setYearMonth] = useState(() => nowLocalInput().slice(0, 7));
  const [reason, setReason] = useState("");
  const [recordedAt, setRecordedAt] = useState(nowLocalInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    if (mode === "savings") setBalance(minorToInput(product.balance_minor, product.currency));
    if (mode === "investment") {
      setValue(minorToInput(product.value_minor, product.currency));
      setCost(signedMinorToInput(product.cost_minor, product.currency));
    }
    if (mode === "credit") {
      setLimit(minorToInput(product.limit_minor, product.currency));
      setStatement(minorToInput(product.statement_minor, product.currency));
      setPaidOff(product.paid_off);
      setYearMonth(nowLocalInput().slice(0, 7));
    }
  }, [mode, product]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function submit() {
    const accessToken = getToken();
    if (!accessToken) return;
    if (!reason.trim()) {
      setError(errorText(t, "reason_required"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const recorded_at = localInputToIso(recordedAt);
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (mode === "create") {
        if (!name.trim()) {
          setError(errorText(t, "name_required"));
          setSaving(false);
          return;
        }
        if (kind === "savings") {
          const balanceMinor = parseAmountToMinor(balance, currency);
          if (balanceMinor == null) {
            setError(t("form.amountInvalid"));
            setSaving(false);
            return;
          }
          await createBankProduct(accessToken, accountId, {
            name: name.trim(),
            product_kind: "savings",
            currency,
            balance_minor: balanceMinor,
            reason: reason.trim(),
            recorded_at,
          });
        } else if (kind === "investment") {
          const valueMinor = parseAmountToMinor(value, currency);
          const costMinor = parseSignedAmountToMinor(cost, currency);
          if (valueMinor == null || costMinor == null) {
            setError(t("form.amountInvalid"));
            setSaving(false);
            return;
          }
          await createBankProduct(accessToken, accountId, {
            name: name.trim(),
            product_kind: "investment",
            currency,
            value_minor: valueMinor,
            cost_minor: costMinor,
            reason: reason.trim(),
            recorded_at,
          });
        } else {
          const limitMinor = parseAmountToMinor(limit, currency);
          const statementMinor = parseAmountToMinor(statement, currency);
          if (limitMinor == null || statementMinor == null) {
            setError(t("form.amountInvalid"));
            setSaving(false);
            return;
          }
          await createBankProduct(accessToken, accountId, {
            name: name.trim(),
            product_kind: "credit",
            currency,
            limit_minor: limitMinor,
            statement_minor: statementMinor,
            paid_off: paidOff,
            reason: reason.trim(),
            recorded_at,
          });
        }
      } else if (mode === "savings" && product) {
        const balanceMinor = parseAmountToMinor(balance, product.currency);
        if (balanceMinor == null) {
          setError(t("form.amountInvalid"));
          setSaving(false);
          return;
        }
        await createBankSavingsTxn(accessToken, accountId, product.id, {
          version: product.version,
          balance_minor: balanceMinor,
          reason: reason.trim(),
          recorded_at,
          timezone: timeZone,
        });
      } else if (mode === "investment" && product) {
        const valueMinor = parseAmountToMinor(value, product.currency);
        const costMinor = parseSignedAmountToMinor(cost, product.currency);
        if (valueMinor == null || costMinor == null) {
          setError(t("form.amountInvalid"));
          setSaving(false);
          return;
        }
        await createBankInvestmentOp(accessToken, accountId, product.id, {
          version: product.version,
          value_minor: valueMinor,
          cost_minor: costMinor,
          reason: reason.trim(),
          recorded_at,
          timezone: timeZone,
        });
      } else if (mode === "credit" && product) {
        const limitMinor = parseAmountToMinor(limit, product.currency);
        const statementMinor = parseAmountToMinor(statement, product.currency);
        if (limitMinor == null || statementMinor == null || !/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) {
          setError(t("form.amountInvalid"));
          setSaving(false);
          return;
        }
        await createBankCreditBill(accessToken, accountId, product.id, {
          version: product.version,
          year_month: yearMonth,
          limit_minor: limitMinor,
          statement_minor: statementMinor,
          paid_off: paidOff,
          reason: reason.trim(),
          recorded_at,
        });
      }
      await onSaved();
    } catch (err) {
      setError(errorText(t, (err as { message?: string }).message ?? ""));
      setSaving(false);
    }
  }

  const title =
    mode === "create"
      ? t("bankDetail.addCard")
      : mode === "savings"
        ? t("bankDetail.updateSavings")
        : mode === "investment"
          ? t("bankDetail.updateInvestment")
          : t("bankDetail.updateCredit");

  const activeKind = mode === "create" ? kind : product?.product_kind;

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
            void submit();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-subhead text-subhead text-text-primary">
              {title}
            </h2>
            <button type="button" className="text-small text-text-secondary" onClick={onClose} disabled={saving}>
              {t("form.close")}
            </button>
          </div>

          {mode === "create" ? (
            <>
              <label className="block space-y-1">
                <span className={labelClass}>{t("bankDetail.cardName")}</span>
                <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
              </label>
              <fieldset className="space-y-2">
                <legend className={labelClass}>{t("bankDetail.cardType")}</legend>
                <div className="flex flex-wrap gap-2">
                  {PRODUCT_KINDS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={kind === item}
                      className={
                        kind === item
                          ? "rounded-xl border border-primary bg-indigo-50 px-3 py-2 text-small text-indigo-700"
                          : "rounded-xl border border-border-subtle px-3 py-2 text-small text-text-secondary"
                      }
                      onClick={() => setKind(item)}
                    >
                      {t(`bankDetail.kinds.${item}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}

          {activeKind === "savings" ? (
            <MoneyField label={t("bankDetail.totalAssets")} value={balance} onChange={setBalance} />
          ) : null}
          {activeKind === "investment" ? (
            <>
              <MoneyField label={t("bankDetail.totalValue")} value={value} onChange={setValue} />
              <MoneyField label={t("bankDetail.cost")} value={cost} onChange={setCost} />
            </>
          ) : null}
          {activeKind === "credit" ? (
            <>
              {mode === "credit" ? (
                <label className="block space-y-1">
                  <span className={labelClass}>{t("bankDetail.yearMonth")}</span>
                  <input
                    required
                    type="month"
                    value={yearMonth}
                    onChange={(event) => setYearMonth(event.target.value)}
                    className={fieldClass}
                  />
                </label>
              ) : null}
              <MoneyField label={t("bankDetail.creditLimit")} value={limit} onChange={setLimit} />
              <MoneyField label={t("bankDetail.monthBill")} value={statement} onChange={setStatement} />
              <label className="flex items-center gap-2 text-small text-text-primary">
                <input type="checkbox" checked={paidOff} onChange={(event) => setPaidOff(event.target.checked)} />
                {t("bankDetail.paidOff")}
              </label>
            </>
          ) : null}

          <label className="block space-y-1">
            <span className={labelClass}>{t("form.reason")}</span>
            <input required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass} />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>{t("form.recordedAt")}</span>
            <input type="datetime-local" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} className={fieldClass} />
          </label>
          {error ? <p className="text-small text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-border-subtle px-4 py-2 text-small text-text-secondary"
              onClick={onClose}
              disabled={saving}
            >
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
      </div>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      <input required inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} className={fieldClass} />
    </label>
  );
}

function parseSignedAmountToMinor(input: string, currency: string): number | null {
  const cleaned = input.replace(/[\s,]/g, "").trim();
  if (!cleaned) return null;
  const negative = cleaned.startsWith("-");
  const raw = negative ? cleaned.slice(1) : cleaned;
  const minor = parseAmountToMinor(raw, currency);
  if (minor == null) return null;
  return negative ? -minor : minor;
}

function signedMinorToInput(amountMinor: number, currency: string): string {
  if (amountMinor >= 0) return minorToInput(amountMinor, currency);
  return `-${minorToInput(Math.abs(amountMinor), currency)}`;
}
