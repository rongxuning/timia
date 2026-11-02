"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { accountKindLabel, errorText } from "@/components/assets/copy";
import { fieldClass, labelClass } from "@/components/assets/fields";
import { createAssetAccount, type LedgerAccountKind } from "@/lib/api/assets";
import { getToken } from "@/lib/auth";

const KINDS = ["savings", "credit", "stock", "metal", "forex"] as const satisfies readonly LedgerAccountKind[];

export type AccountCard = {
  id: string;
  code: string;
  name: string;
  account_kind: string;
  account_number: string;
};

type AccountSectionProps = {
  accounts: AccountCard[];
  onSaved: () => Promise<void>;
};

export function AccountSection({ accounts, onSaved }: AccountSectionProps) {
  const t = useTranslations("assets");
  const [open, setOpen] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-body font-medium text-text-primary">{t("accounts.title")}</h2>
        <button
          type="button"
          className="rounded-xl bg-primary px-4 py-2 text-small font-medium text-on-primary hover:bg-primary-hover"
          onClick={() => setOpen(true)}
        >
          {t("accounts.add")}
        </button>
      </div>
      {accounts.length === 0 ? (
        <p className="mt-3 text-small text-text-secondary">{t("accounts.empty")}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {accounts.map((account) => (
            <li key={account.id}>
              <article className="flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-white px-lg py-md">
                <div className="min-w-0">
                  <p className="truncate text-body text-text-primary">{account.name}</p>
                  <p className="mt-0.5 text-caption text-text-secondary">{accountKindLabel(t, account.account_kind)}</p>
                </div>
                <p className="shrink-0 font-code text-small tabular-nums text-text-primary">{account.account_number}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <AddAccountDialog
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await onSaved();
          }}
        />
      ) : null}
    </section>
  );
}

function AddAccountDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const t = useTranslations("assets");
  const titleId = useId();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LedgerAccountKind>("savings");
  const [number, setNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!name.trim() || !number.trim()) {
      setError(errorText(t, !name.trim() ? "name_required" : "account_number_required"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createAssetAccount(accessToken, {
        name: name.trim(),
        account_kind: kind,
        account_number: number.trim(),
      });
      await onSaved();
    } catch (err) {
      setError(errorText(t, (err as { message?: string }).message ?? ""));
      setSaving(false);
    }
  }

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
              {t("accounts.createTitle")}
            </h2>
            <button type="button" className="text-small text-text-secondary" onClick={onClose} disabled={saving}>
              {t("form.close")}
            </button>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>{t("accounts.name")}</span>
            <input
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className={labelClass}>{t("accounts.type")}</legend>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((item) => (
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
                  {t(`accounts.kinds.${item}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="block space-y-1">
            <span className={labelClass}>{t("accounts.number")}</span>
            <input
              required
              maxLength={40}
              value={number}
              autoComplete="off"
              onChange={(event) => setNumber(event.target.value)}
              className={fieldClass}
            />
            <span className="text-caption text-text-secondary">{t("accounts.numberHint")}</span>
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
