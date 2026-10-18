"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { categoriesFor, type AssetKind } from "@/components/assets/categories";
import { categoryHint, categoryLabel, kindLabel } from "@/components/assets/copy";
import { currencyDigits } from "@/lib/money";

export type HoldingDraft = {
  mode: "create" | "edit";
  id?: string;
  version?: number;
  name: string;
  kind: AssetKind;
  category: string;
  amount: string;
  institution: string;
  note: string;
  asOf: string;
  includeInNetWorth: boolean;
};

type HoldingFormDialogProps = {
  draft: HoldingDraft;
  currency: string;
  saving: boolean;
  error: string | null;
  onChange: (draft: HoldingDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onArchive: () => void;
};

export function HoldingFormDialog({
  draft,
  currency,
  saving,
  error,
  onChange,
  onClose,
  onSubmit,
  onArchive,
}: HoldingFormDialogProps) {
  const t = useTranslations("assets");
  const titleId = useId();
  const [confirmArchive, setConfirmArchive] = useState(false);
  const categories = categoriesFor(draft.kind);
  const digits = currencyDigits(currency);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  function setKind(kind: AssetKind) {
    const nextCategories = categoriesFor(kind);
    const category = nextCategories.includes(draft.category as (typeof nextCategories)[number])
      ? draft.category
      : nextCategories[0];
    onChange({ ...draft, kind, category });
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-[calc(100vh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-auto rounded-xl border border-border-subtle bg-surface p-6 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="font-subhead text-subhead text-text-primary">
              {draft.mode === "create" ? t("form.createTitle") : t("form.editTitle")}
            </h2>
            <button
              type="button"
              className="rounded-xl border border-border-subtle px-3 py-1.5 text-small text-text-secondary hover:bg-surface-container-lowest"
              onClick={onClose}
              disabled={saving}
            >
              {t("form.close")}
            </button>
          </div>

          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <fieldset className="space-y-2">
              <legend className="text-small font-medium text-on-surface-variant">{t("form.kind")}</legend>
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
                        : "border-border-subtle text-text-secondary hover:bg-surface-container-lowest",
                    ].join(" ")}
                    onClick={() => setKind(kind)}
                  >
                    {kindLabel(t, kind)}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">{t("form.name")}</span>
              <input
                autoFocus
                required
                maxLength={80}
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">{t("form.category")}</span>
              <select
                value={draft.category}
                onChange={(event) => onChange({ ...draft, category: event.target.value })}
                className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(t, category)}
                  </option>
                ))}
              </select>
              <span className="block text-caption text-text-secondary">{categoryHint(t, draft.category)}</span>
            </label>

            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">
                {t("form.amount")}
                <span className="ml-2 font-normal text-text-secondary">{currency}</span>
              </span>
              <input
                inputMode="decimal"
                required
                value={draft.amount}
                placeholder={digits === 0 ? "0" : "0.00"}
                onChange={(event) => onChange({ ...draft, amount: event.target.value })}
                className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body tabular-nums outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-small font-medium text-on-surface-variant">
                  {t("form.institution")}
                  <span className="ml-2 font-normal text-text-secondary">{t("form.institutionOptional")}</span>
                </span>
                <input
                  maxLength={80}
                  value={draft.institution}
                  onChange={(event) => onChange({ ...draft, institution: event.target.value })}
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-small font-medium text-on-surface-variant">{t("form.asOf")}</span>
                <input
                  type="date"
                  required
                  value={draft.asOf}
                  onChange={(event) => onChange({ ...draft, asOf: event.target.value })}
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </label>
            </div>

            <label className="flex items-start gap-2 text-small text-text-primary">
              <input
                type="checkbox"
                className="mt-1"
                checked={draft.includeInNetWorth}
                onChange={(event) => onChange({ ...draft, includeInNetWorth: event.target.checked })}
              />
              <span>
                {t("form.include")}
                <span className="mt-1 block text-caption text-text-secondary">{t("form.includeHint")}</span>
              </span>
            </label>

            <label className="block space-y-1">
              <span className="text-small font-medium text-on-surface-variant">{t("form.note")}</span>
              <textarea
                maxLength={500}
                rows={2}
                value={draft.note}
                onChange={(event) => onChange({ ...draft, note: event.target.value })}
                className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
            </label>

            {error ? (
              <p className="rounded-xl border border-error-container bg-error-container/10 px-3 py-2 text-small text-error">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3">
              {draft.mode === "edit" ? (
                confirmArchive ? (
                  <button
                    type="button"
                    className="rounded-xl bg-red-600 px-4 py-2 text-small text-white hover:bg-red-700 disabled:opacity-50"
                    onClick={onArchive}
                    disabled={saving}
                  >
                    {saving ? t("form.archiving") : t("form.archiveConfirm")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-small text-error hover:underline"
                    onClick={() => setConfirmArchive(true)}
                    disabled={saving}
                  >
                    {t("form.archive")}
                  </button>
                )
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-border-subtle px-4 py-2 text-small text-text-secondary hover:bg-surface-container-lowest disabled:opacity-50"
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
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
