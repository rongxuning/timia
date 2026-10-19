"use client";

import { useTranslations } from "next-intl";
import { accountKindLabel, categoryLabel, institutionKindLabel } from "@/components/assets/copy";
import { formatMinor, formatStamp } from "@/lib/money";
import type { AssetHolding, AssetPartyNode } from "@/types/api/views/assets";

type AssetTreeProps = {
  parties: AssetPartyNode[];
  display: string;
  locale: string;
  money: (amount: number) => string;
  onAdjust: (holding: AssetHolding) => void;
  onAddAccount: (party: AssetPartyNode) => void;
  onAddCurrency: (party: AssetPartyNode, accountId: string, accountKind: string) => void;
};

export function AssetTree({
  parties,
  display,
  locale,
  money,
  onAdjust,
  onAddAccount,
  onAddCurrency,
}: AssetTreeProps) {
  const t = useTranslations("assets");
  if (parties.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-small font-medium text-text-primary">{t("tree.title")}</h2>
      {parties.map((party) => (
        <details key={party.id} open className="rounded-xl border border-border-subtle bg-white p-lg">
          <summary className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="font-code text-caption text-text-secondary">{party.code}</span>
              <span className="ml-2 text-small font-medium text-text-primary">{party.name}</span>
              <span className="ml-2 text-caption text-text-secondary">{institutionKindLabel(t, party.institution_kind)}</span>
            </span>
            <span className="text-small tabular-nums text-text-primary">{money(party.display_minor)}</span>
          </summary>
          <div className="mt-3 space-y-3">
            {party.accounts.map((account) => (
              <div key={account.id} className="rounded-xl border border-border-subtle p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-small text-text-primary">
                      <span className="font-code text-caption text-text-secondary">{account.code}</span>
                      <span className="ml-2">{account.name}</span>
                    </p>
                    <p className="text-caption text-text-secondary">
                      {accountKindLabel(t, account.account_kind)}
                      {account.card_number ? ` · ${t("tree.cardNumber", { number: account.card_number })}` : ""}
                      {account.asset_account_no ? ` · ${t("tree.assetAccountNo", { number: account.asset_account_no })}` : ""}
                      {account.account_number ? ` · ${t("tree.accountNumber", { number: account.account_number })}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-small tabular-nums">{money(account.display_minor)}</p>
                    <button
                      type="button"
                      className="text-caption text-primary"
                      onClick={() => onAddCurrency(party, account.id, account.account_kind)}
                    >
                      {account.account_kind === "securities" ? t("tree.addPosition") : t("tree.addCurrency")}
                    </button>
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-border-subtle">
                  {account.balances.map((holding) => (
                    <li key={holding.id} className="flex items-start justify-between gap-3 py-2">
                      <div>
                        <p className="text-small text-text-primary">
                          <span className="font-code text-caption text-text-secondary">{holding.code}</span>
                          <span className="ml-2">{holding.name}</span>
                          <span className="ml-2 text-caption text-text-secondary">{categoryLabel(t, holding.category)}</span>
                        </p>
                        <p className="text-caption text-text-secondary">
                          {formatStamp(holding.adjusted_at, locale)}
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
                      </div>
                      <div className="text-right">
                        <p className="text-small tabular-nums">
                          {holding.display_minor == null ? "—" : money(holding.display_minor)}
                        </p>
                        <button type="button" className="text-caption text-primary" onClick={() => onAdjust(holding)}>
                          {t("holding.adjust")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <button type="button" className="text-small text-primary" onClick={() => onAddAccount(party)}>
              {t("tree.addAccount")}
            </button>
          </div>
        </details>
      ))}
    </section>
  );
}
