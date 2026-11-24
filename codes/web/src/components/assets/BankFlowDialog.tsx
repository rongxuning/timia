"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { errorText } from "@/components/assets/copy";
import { fieldClass, labelClass } from "@/components/assets/fields";
import { ModalDialog } from "@/components/ModalDialog";
import { createBankFlow } from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { BANK_FLOW_CATEGORIES, type BankFlowCategory } from "@/lib/bankFlowCategories";
import { localInputToIso, nowLocalInput, parseAmountToMinor } from "@/lib/money";
import type { BankFlowDirection } from "@/types/api/views/bank";

type BankFlowDialogProps = {
  accountId: string;
  direction: BankFlowDirection;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

const CURRENCY = "CNY";

export function BankFlowDialog({ accountId, direction, onClose, onSaved }: BankFlowDialogProps) {
  const t = useTranslations("assets");
  const titleId = useId();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<BankFlowCategory>(BANK_FLOW_CATEGORIES[direction][0]);
  const [recordedAt, setRecordedAt] = useState(nowLocalInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const accessToken = getToken();
    if (!accessToken) return;
    const amountMinor = parseAmountToMinor(amount, CURRENCY);
    if (amountMinor == null || amountMinor <= 0) {
      setError(t("form.amountInvalid"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createBankFlow(accessToken, accountId, {
        direction,
        category,
        amount_minor: amountMinor,
        currency: CURRENCY,
        recorded_at: localInputToIso(recordedAt),
      });
      await onSaved();
    } catch (err) {
      setError(errorText(t, (err as { message?: string }).message ?? ""));
      setSaving(false);
    }
  }

  return (
    <ModalDialog
      titleId={titleId}
      onClose={onClose}
      busy={saving}
      className="max-h-[calc(100vh-2rem)] w-[min(36rem,calc(100vw-2rem))] space-y-4 overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-xl"
    >
      {({ requestClose }) => (
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-subhead text-subhead text-text-primary">
              {direction === "income" ? t("bankDetail.flows.addIncome") : t("bankDetail.flows.addExpense")}
            </h2>
            <button type="button" className="text-small text-text-secondary" onClick={requestClose} disabled={saving}>
              {t("form.close")}
            </button>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>{t("bankDetail.flows.amount")}</span>
            <input
              required
              autoFocus
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={fieldClass}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className={labelClass}>{t("bankDetail.flows.type")}</legend>
            <div className="flex flex-wrap gap-2">
              {BANK_FLOW_CATEGORIES[direction].map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={category === item}
                  className={
                    category === item
                      ? "rounded-xl border border-primary bg-indigo-50 px-3 py-2 text-small text-indigo-700"
                      : "rounded-xl border border-border-subtle px-3 py-2 text-small text-text-secondary"
                  }
                  onClick={() => setCategory(item)}
                >
                  {t(`bankDetail.flows.categories.${item}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block space-y-1">
            <span className={labelClass}>{t("form.recordedAt")}</span>
            <input
              type="datetime-local"
              value={recordedAt}
              onChange={(event) => setRecordedAt(event.target.value)}
              className={fieldClass}
            />
          </label>
          {error ? <p className="text-small text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-border-subtle px-4 py-2 text-small text-text-secondary"
              onClick={requestClose}
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
      )}
    </ModalDialog>
  );
}
