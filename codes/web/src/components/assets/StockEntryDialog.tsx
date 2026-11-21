"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { errorText } from "@/components/assets/copy";
import { fieldClass, labelClass } from "@/components/assets/fields";
import {
  createStockPosition,
  createStockTransfer,
  markStockPosition,
  setStockCash,
} from "@/lib/api/assets";
import { getToken } from "@/lib/auth";
import { localInputToIso, minorToInput, nowLocalInput, parseAmountToMinor } from "@/lib/money";
import type { StockMarket, StockPosition, StockTransferDirection } from "@/types/api/views/stock";

export type StockDialogMode = "position" | "mark" | "transfer" | "cash";

type StockEntryDialogProps = {
  accountId: string;
  mode: StockDialogMode;
  position: StockPosition | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function StockEntryDialog({ accountId, mode, position, onClose, onSaved }: StockEntryDialogProps) {
  const t = useTranslations("assets");
  const titleId = useId();
  const [symbol, setSymbol] = useState(position?.symbol ?? "");
  const [name, setName] = useState(position?.name ?? "");
  const [market, setMarket] = useState<StockMarket>(position?.market ?? "a_share");
  const liveShares = mode === "mark" && position ? position.current_shares : null;
  const liveCost = mode === "mark" && position ? position.current_cost_price_minor : null;
  const livePrice = mode === "mark" && position ? position.current_market_price_minor : null;
  const [shares, setShares] = useState(liveShares == null ? "" : String(liveShares));
  const [cost, setCost] = useState(
    liveCost == null || !position ? "" : minorToInput(liveCost, position.currency),
  );
  const [price, setPrice] = useState(
    livePrice == null || !position ? "" : minorToInput(livePrice, position.currency),
  );
  const [direction, setDirection] = useState<StockTransferDirection>("bank_to_securities");
  const [currency, setCurrency] = useState(position?.currency ?? "CNY");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [recordedAt, setRecordedAt] = useState(nowLocalInput);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceCurrency = mode === "position" || mode === "mark" ? (market === "hk_share" ? "HKD" : "CNY") : currency;

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
      if (mode === "position" || mode === "mark") {
        const shareCount = Number(shares);
        const costMinor = parseAmountToMinor(cost, priceCurrency);
        const priceMinor = parseAmountToMinor(price, priceCurrency);
        if (!Number.isInteger(shareCount) || shareCount < (mode === "position" ? 1 : 0) || costMinor == null || priceMinor == null) {
          setError(t("form.amountInvalid"));
          setSaving(false);
          return;
        }
        if (mode === "position") {
          if (!name.trim() || !symbol.trim()) {
            setError(errorText(t, !name.trim() ? "name_required" : "symbol_invalid"));
            setSaving(false);
            return;
          }
          await createStockPosition(accessToken, accountId, {
            symbol: symbol.trim(),
            name: name.trim(),
            market,
            shares: shareCount,
            cost_price_minor: costMinor,
            market_price_minor: priceMinor,
            reason: reason.trim(),
            recorded_at,
          });
        } else if (position) {
          await markStockPosition(accessToken, accountId, position.id, {
            version: position.version,
            shares: shareCount,
            cost_price_minor: costMinor,
            market_price_minor: priceMinor,
            reason: reason.trim(),
            recorded_at,
          });
        }
      } else {
        const amountMinor = parseAmountToMinor(amount, currency);
        if (amountMinor == null || (mode === "transfer" && amountMinor <= 0)) {
          setError(t("form.amountInvalid"));
          setSaving(false);
          return;
        }
        if (mode === "transfer") {
          await createStockTransfer(accessToken, accountId, {
            direction,
            currency,
            amount_minor: amountMinor,
            reason: reason.trim(),
            recorded_at,
          });
        } else {
          await setStockCash(accessToken, accountId, {
            currency,
            amount_minor: amountMinor,
            reason: reason.trim(),
            recorded_at,
          });
        }
      }
      await onSaved();
    } catch (err) {
      setError(errorText(t, (err as { message?: string }).message ?? ""));
      setSaving(false);
    }
  }

  const title =
    mode === "position"
      ? t("stockDetail.addPosition")
      : mode === "mark"
        ? t("stockDetail.updatePosition")
        : mode === "transfer"
          ? t("stockDetail.addTransfer")
          : t("stockDetail.setCash");

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
          {mode === "position" ? (
            <>
              <label className="block space-y-1">
                <span className={labelClass}>{t("stockDetail.symbol")}</span>
                <input required maxLength={12} value={symbol} onChange={(event) => setSymbol(event.target.value)} className={fieldClass} />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>{t("form.name")}</span>
                <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
              </label>
              <fieldset className="space-y-2">
                <legend className={labelClass}>{t("form.category")}</legend>
                <div className="flex flex-wrap gap-2">
                  {(["a_share", "hk_share"] as const).map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={market === item}
                      className={
                        market === item
                          ? "rounded-xl border border-primary bg-indigo-50 px-3 py-2 text-small text-indigo-700"
                          : "rounded-xl border border-border-subtle px-3 py-2 text-small text-text-secondary"
                      }
                      onClick={() => setMarket(item)}
                    >
                      {t(`categories.${item}`)}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}
          {mode === "position" || mode === "mark" ? (
            <>
              <label className="block space-y-1">
                <span className={labelClass}>{t("stockDetail.shareCount")}</span>
                <input required inputMode="numeric" value={shares} onChange={(event) => setShares(event.target.value)} className={fieldClass} />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>{t("stockDetail.costPrice")}</span>
                <input required inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} className={fieldClass} />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>{t("stockDetail.marketPrice")}</span>
                <input required inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} className={fieldClass} />
              </label>
            </>
          ) : (
            <>
              {mode === "transfer" ? (
                <fieldset className="space-y-2">
                  <legend className={labelClass}>{t("stockDetail.direction")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {(["bank_to_securities", "securities_to_bank"] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={direction === item}
                        className={
                          direction === item
                            ? "rounded-xl border border-primary bg-indigo-50 px-3 py-2 text-small text-indigo-700"
                            : "rounded-xl border border-border-subtle px-3 py-2 text-small text-text-secondary"
                        }
                        onClick={() => setDirection(item)}
                      >
                        {t(item === "bank_to_securities" ? "stockDetail.bankIn" : "stockDetail.bankOut")}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <label className="block space-y-1">
                <span className={labelClass}>{t("form.currency")}</span>
                <select value={currency} onChange={(event) => setCurrency(event.target.value)} className={fieldClass}>
                  <option value="CNY">{t("currencies.CNY")}</option>
                  <option value="HKD">{t("currencies.HKD")}</option>
                  <option value="USD">{t("currencies.USD")}</option>
                  <option value="EUR">{t("currencies.EUR")}</option>
                  <option value="GBP">{t("currencies.GBP")}</option>
                  <option value="JPY">{t("currencies.JPY")}</option>
                  <option value="KRW">{t("currencies.KRW")}</option>
                </select>
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>{t("form.amount")}</span>
                <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={fieldClass} />
              </label>
            </>
          )}
          <label className="block space-y-1">
            <span className={labelClass}>{t("form.reason")}</span>
            <input required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} className={fieldClass} />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>{t("form.recordedAt")}</span>
            <input required type="datetime-local" value={recordedAt} onChange={(event) => setRecordedAt(event.target.value)} className={fieldClass} />
          </label>
          {error ? <p className="text-small text-error">{error}</p> : null}
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-primary px-4 py-2 text-small text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? t("form.saving") : t("form.save")}
          </button>
        </form>
      </div>
    </div>
  );
}
