export const ASSET_CATEGORIES = [
  "a_share",
  "hk_share",
  "bank_deposit",
  "wallet",
  "housing_fund",
  "medical",
  "fx",
  "gold",
  "other_asset",
] as const;

export const LIABILITY_CATEGORIES = ["credit_card", "other_liability"] as const;

export const EXPENSE_GROUPS = ["fixed", "daily", "emergency", "other"] as const;

export const BOOK_CURRENCIES = ["CNY", "HKD", "JPY", "KRW", "USD", "EUR", "GBP"] as const;

export type AssetKind = "asset" | "liability";
export type AssetCategory = (typeof ASSET_CATEGORIES)[number] | (typeof LIABILITY_CATEGORIES)[number];
export type ExpenseGroup = (typeof EXPENSE_GROUPS)[number];
export type BookCurrency = (typeof BOOK_CURRENCIES)[number];

export function categoriesFor(kind: AssetKind): readonly AssetCategory[] {
  return kind === "asset" ? ASSET_CATEGORIES : LIABILITY_CATEGORIES;
}

export type AccountStarter = {
  id: string;
  kind: AssetKind;
  category: AssetCategory;
  currency: BookCurrency;
};

export const ACCOUNT_STARTERS: AccountStarter[] = [
  { id: "aShare", kind: "asset", category: "a_share", currency: "CNY" },
  { id: "hkShare", kind: "asset", category: "hk_share", currency: "HKD" },
  { id: "ccbSavings", kind: "asset", category: "bank_deposit", currency: "CNY" },
  { id: "ccbCredit", kind: "liability", category: "credit_card", currency: "CNY" },
  { id: "spdbSavings", kind: "asset", category: "bank_deposit", currency: "CNY" },
  { id: "spdbCredit", kind: "liability", category: "credit_card", currency: "CNY" },
  { id: "cmbSavings", kind: "asset", category: "bank_deposit", currency: "CNY" },
  { id: "hsbc", kind: "asset", category: "bank_deposit", currency: "HKD" },
  { id: "housingFund", kind: "asset", category: "housing_fund", currency: "CNY" },
  { id: "medical", kind: "asset", category: "medical", currency: "CNY" },
  { id: "wechat", kind: "asset", category: "wallet", currency: "CNY" },
  { id: "alipay", kind: "asset", category: "wallet", currency: "CNY" },
  { id: "jpy", kind: "asset", category: "fx", currency: "JPY" },
  { id: "krw", kind: "asset", category: "fx", currency: "KRW" },
  { id: "gold", kind: "asset", category: "gold", currency: "CNY" },
];

export type ExpenseStarter = {
  id: string;
  group: ExpenseGroup;
  currency: BookCurrency;
  amount?: string;
};

export const EXPENSE_STARTERS: ExpenseStarter[] = [
  { id: "housing", group: "fixed", currency: "CNY" },
  { id: "sport", group: "fixed", currency: "CNY" },
  { id: "insurance", group: "fixed", currency: "CNY" },
  { id: "food", group: "daily", currency: "CNY" },
  { id: "commute", group: "daily", currency: "CNY" },
  { id: "shopping", group: "daily", currency: "CNY" },
  { id: "emergency", group: "emergency", currency: "CNY", amount: "10000" },
];
