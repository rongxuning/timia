"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { BOOK_CURRENCIES, EXPENSE_GROUPS, type ExpenseGroup } from "@/components/assets/categories";
import { currencyLabel, groupHint, groupLabel } from "@/components/assets/copy";
import { fieldClass, labelClass } from "@/components/assets/fields";
import { currencyDigits, formatMinor, formatStamp } from "@/lib/money";
import type { AssetAdjustment, AssetExpense } from "@/types/api/views/assets";

export type ExpenseDraft = {
  mode: "create" | "adjust";
  id?: string;
  version?: number;
  name: string;
  group: ExpenseGroup;
  currency: string;
  amount: string;
  reason: string;
  recordedAt: string;
};

type ExpenseDialogProps = {
  draft: ExpenseDraft;
  locale: string;
  saving: boolean;
  error: string | null;
  history: AssetAdjustment[];
  current: AssetExpense | null;
  onChange: (draft: ExpenseDraft) => void;
  onClose: () => void;
  onCreate: () => void;
  onAdjust: () => void;
  onArchive: (reason: string) => void;
};

export function ExpenseDialog({
  draft,
  locale,
  saving,
  error,
  history,
  current,
  onChange,
  onClose,
  onCreate,
  onAdjust,
  onArchive,
}: ExpenseDialogProps) {
  const t = useTranslations("assets");
  const titleId = useId();
  const digits = currencyDigits(draft.currency);
  const [archiveReason, setArchiveReason] = useState("");
  const [confirmArchive, setConfirmArchive] = useState(false);

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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-subhead text-subhead text-text-primary">
              {draft.mode === "create" ? t("expense.createTitle") : draft.name}
            </h2>
            <button type="button" className="text-small text-text-secondary" onClick={onClose}>
              {t("form.close")}
            </button>
          </div>
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.mode === "create") onCreate();
              else onAdjust();
            }}
          >
            {draft.mode === "create" ? (
              <>
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
                    <span className={labelClass}>{t("expense.group")}</span>
                    <select
                      value={draft.group}
                      onChange={(event) => onChange({ ...draft, group: event.target.value as ExpenseGroup })}
                      className={fieldClass}
                    >
                      {EXPENSE_GROUPS.map((group) => (
                        <option key={group} value={group}>
                          {groupLabel(t, group)}
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
                      {BOOK_CURRENCIES.map((code) => (
                        <option key={code} value={code}>
                          {currencyLabel(t, code)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-caption text-text-secondary">{groupHint(t, draft.group)}</p>
              </>
            ) : current ? (
              <p className="tabular-nums text-text-primary">
                {formatMinor(current.amount_minor, current.currency, locale)}
              </p>
            ) : null}
            <label className="block space-y-1">
              <span className={labelClass}>
                {t("form.amount")} <span className="font-normal">{draft.currency}</span>
              </span>
              <input
                inputMode="decimal"
                required
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
                type="datetime-local"
                required
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
                {saving ? t("form.saving") : draft.mode === "create" ? t("form.save") : t("form.recordAdjustment")}
              </button>
            </div>
          </form>
          {draft.mode === "adjust" ? (
            <div className="mt-5 border-t border-border-subtle pt-4">
              <p className="text-small font-medium">{t("form.history")}</p>
              <ul className="mt-2 space-y-2">
                {history.map((row) => (
                  <li key={row.id} className="text-small">
                    <p>{row.reason}</p>
                    <p className="text-caption tabular-nums text-text-secondary">
                      {formatStamp(row.recorded_at, locale)} · {formatMinor(row.amount_minor, draft.currency, locale)}
                    </p>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-3 text-small text-error"
                onClick={() => setConfirmArchive(true)}
              >
                {t("form.archive")}
              </button>
              {confirmArchive ? (
                <form
                  className="mt-3 space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (archiveReason.trim()) onArchive(archiveReason.trim());
                  }}
                >
                  <input
                    required
                    maxLength={200}
                    value={archiveReason}
                    placeholder={t("form.archiveReason")}
                    onChange={(event) => setArchiveReason(event.target.value)}
                    className={fieldClass}
                  />
                  <button type="submit" className="rounded-xl bg-red-600 px-4 py-2 text-small text-white" disabled={saving}>
                    {t("form.archiveConfirm")}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
