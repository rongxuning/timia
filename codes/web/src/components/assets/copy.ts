import type { useTranslations } from "next-intl";
import type { AssetKind } from "@/components/assets/categories";

type AssetsT = ReturnType<typeof useTranslations<"assets">>;

export function categoryLabel(t: AssetsT, category: string): string {
  switch (category) {
    case "cash":
      return t("categories.cash");
    case "investment":
      return t("categories.investment");
    case "property":
      return t("categories.property");
    case "durable":
      return t("categories.durable");
    case "receivable":
      return t("categories.receivable");
    case "other_asset":
      return t("categories.other_asset");
    case "credit":
      return t("categories.credit");
    case "installment":
      return t("categories.installment");
    case "mortgage":
      return t("categories.mortgage");
    case "payable":
      return t("categories.payable");
    case "other_liability":
      return t("categories.other_liability");
    default:
      return category;
  }
}

export function categoryHint(t: AssetsT, category: string): string {
  switch (category) {
    case "cash":
      return t("categoryHints.cash");
    case "investment":
      return t("categoryHints.investment");
    case "property":
      return t("categoryHints.property");
    case "durable":
      return t("categoryHints.durable");
    case "receivable":
      return t("categoryHints.receivable");
    case "other_asset":
      return t("categoryHints.other_asset");
    case "credit":
      return t("categoryHints.credit");
    case "installment":
      return t("categoryHints.installment");
    case "mortgage":
      return t("categoryHints.mortgage");
    case "payable":
      return t("categoryHints.payable");
    case "other_liability":
      return t("categoryHints.other_liability");
    default:
      return "";
  }
}

export function kindLabel(t: AssetsT, kind: AssetKind): string {
  return kind === "asset" ? t("kinds.asset") : t("kinds.liability");
}

export function focusText(t: AssetsT, focus: string): string {
  switch (focus) {
    case "start":
      return t("focus.start");
    case "high_interest":
      return t("focus.high_interest");
    case "emergency":
      return t("focus.emergency");
    case "set_essential":
      return t("focus.set_essential");
    case "excess_cash":
      return t("focus.excess_cash");
    case "balanced":
      return t("focus.balanced");
    default:
      return t("focus.balanced");
  }
}

export function emergencyBandLabel(t: AssetsT, band: string): string {
  switch (band) {
    case "unset":
      return t("bands.unset");
    case "thin":
      return t("bands.thin");
    case "building":
      return t("bands.building");
    case "adequate":
      return t("bands.adequate");
    case "comfortable":
      return t("bands.comfortable");
    case "excess":
      return t("bands.excess");
    default:
      return band;
  }
}

export function debtBandLabel(t: AssetsT, band: string): string {
  switch (band) {
    case "none":
      return t("bands.none");
    case "low":
      return t("bands.low");
    case "moderate":
      return t("bands.moderate");
    case "high":
      return t("bands.high");
    default:
      return band;
  }
}

export function currencyLabel(t: AssetsT, currency: string): string {
  switch (currency) {
    case "CNY":
      return t("currencies.CNY");
    case "USD":
      return t("currencies.USD");
    case "HKD":
      return t("currencies.HKD");
    case "EUR":
      return t("currencies.EUR");
    case "GBP":
      return t("currencies.GBP");
    case "JPY":
      return t("currencies.JPY");
    default:
      return currency;
  }
}

export function errorText(t: AssetsT, message: string): string {
  switch (message) {
    case "not_found":
      return t("errors.not_found");
    case "version_conflict":
      return t("errors.version_conflict");
    case "category_kind_mismatch":
      return t("errors.category_kind_mismatch");
    case "as_of_in_future":
      return t("errors.as_of_in_future");
    case "as_of_too_old":
      return t("errors.as_of_too_old");
    case "currency_has_holdings":
      return t("errors.currency_has_holdings");
    case "unsupported_currency":
      return t("errors.unsupported_currency");
    case "name_required":
      return t("errors.name_required");
    default:
      return t("errors.generic");
  }
}
