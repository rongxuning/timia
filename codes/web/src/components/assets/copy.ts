import type { useTranslations } from "next-intl";
import type { AssetKind, ExpenseGroup } from "@/components/assets/categories";

type AssetsT = ReturnType<typeof useTranslations<"assets">>;

export function categoryLabel(t: AssetsT, category: string): string {
  switch (category) {
    case "a_share":
      return t("categories.a_share");
    case "hk_share":
      return t("categories.hk_share");
    case "bank_deposit":
      return t("categories.bank_deposit");
    case "wallet":
      return t("categories.wallet");
    case "housing_fund":
      return t("categories.housing_fund");
    case "medical":
      return t("categories.medical");
    case "fx":
      return t("categories.fx");
    case "gold":
      return t("categories.gold");
    case "other_asset":
      return t("categories.other_asset");
    case "credit_card":
      return t("categories.credit_card");
    case "other_liability":
      return t("categories.other_liability");
    default:
      return category;
  }
}

export function categoryHint(t: AssetsT, category: string): string {
  switch (category) {
    case "a_share":
      return t("categoryHints.a_share");
    case "hk_share":
      return t("categoryHints.hk_share");
    case "bank_deposit":
      return t("categoryHints.bank_deposit");
    case "wallet":
      return t("categoryHints.wallet");
    case "housing_fund":
      return t("categoryHints.housing_fund");
    case "medical":
      return t("categoryHints.medical");
    case "fx":
      return t("categoryHints.fx");
    case "gold":
      return t("categoryHints.gold");
    case "other_asset":
      return t("categoryHints.other_asset");
    case "credit_card":
      return t("categoryHints.credit_card");
    case "other_liability":
      return t("categoryHints.other_liability");
    default:
      return "";
  }
}

export function groupLabel(t: AssetsT, group: string): string {
  switch (group) {
    case "fixed":
      return t("groups.fixed");
    case "daily":
      return t("groups.daily");
    case "emergency":
      return t("groups.emergency");
    case "other":
      return t("groups.other");
    default:
      return group;
  }
}

export function groupHint(t: AssetsT, group: string): string {
  switch (group) {
    case "fixed":
      return t("groupHints.fixed");
    case "daily":
      return t("groupHints.daily");
    case "emergency":
      return t("groupHints.emergency");
    case "other":
      return t("groupHints.other");
    default:
      return "";
  }
}

export function kindLabel(t: AssetsT, kind: AssetKind): string {
  return kind === "asset" ? t("kinds.asset") : t("kinds.liability");
}

export function currencyLabel(t: AssetsT, currency: string): string {
  switch (currency) {
    case "CNY":
      return t("currencies.CNY");
    case "HKD":
      return t("currencies.HKD");
    case "JPY":
      return t("currencies.JPY");
    case "KRW":
      return t("currencies.KRW");
    case "USD":
      return t("currencies.USD");
    case "EUR":
      return t("currencies.EUR");
    case "GBP":
      return t("currencies.GBP");
    default:
      return currency;
  }
}

export function starterLabel(t: AssetsT, id: string): string {
  switch (id) {
    case "aShare":
      return t("starters.aShare");
    case "hkShare":
      return t("starters.hkShare");
    case "ccbSavings":
      return t("starters.ccbSavings");
    case "ccbCredit":
      return t("starters.ccbCredit");
    case "spdbSavings":
      return t("starters.spdbSavings");
    case "spdbCredit":
      return t("starters.spdbCredit");
    case "cmbSavings":
      return t("starters.cmbSavings");
    case "hsbc":
      return t("starters.hsbc");
    case "housingFund":
      return t("starters.housingFund");
    case "medical":
      return t("starters.medical");
    case "wechat":
      return t("starters.wechat");
    case "alipay":
      return t("starters.alipay");
    case "jpy":
      return t("starters.jpy");
    case "krw":
      return t("starters.krw");
    case "gold":
      return t("starters.gold");
    case "housing":
      return t("expenseStarters.housing");
    case "sport":
      return t("expenseStarters.sport");
    case "insurance":
      return t("expenseStarters.insurance");
    case "food":
      return t("expenseStarters.food");
    case "commute":
      return t("expenseStarters.commute");
    case "shopping":
      return t("expenseStarters.shopping");
    case "emergency":
      return t("expenseStarters.emergency");
    default:
      return id;
  }
}

export function focusText(t: AssetsT, focus: string): string {
  switch (focus) {
    case "start":
      return t("focus.start");
    case "missing_fx":
      return t("focus.missing_fx");
    case "credit":
      return t("focus.credit");
    default:
      return t("focus.balanced");
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
    case "recorded_at_in_future":
      return t("errors.recorded_at_in_future");
    case "recorded_at_too_old":
      return t("errors.recorded_at_too_old");
    case "unsupported_currency":
      return t("errors.unsupported_currency");
    case "cny_rate_fixed":
      return t("errors.cny_rate_fixed");
    case "reason_required":
      return t("errors.reason_required");
    case "name_required":
      return t("errors.name_required");
    default:
      return t("errors.generic");
  }
}

export function expenseGroupOrder(group: string): number {
  const order: ExpenseGroup[] = ["fixed", "daily", "emergency", "other"];
  const index = order.indexOf(group as ExpenseGroup);
  return index === -1 ? order.length : index;
}
