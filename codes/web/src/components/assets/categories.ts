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
  partyName: string;
  institutionKind: "bank" | "broker" | "payment" | "agency" | "other";
  accountKind: "debit_card" | "credit_card" | "securities" | "wallet" | "housing_fund" | "medical" | "gold" | "fx" | "other";
  accountName: string;
  category: AssetCategory;
  currency: BookCurrency;
};

export const ACCOUNT_STARTERS: AccountStarter[] = [
  { id: "aShare", partyName: "证券账户", institutionKind: "broker", accountKind: "securities", accountName: "A股", category: "a_share", currency: "CNY" },
  { id: "hkShare", partyName: "证券账户", institutionKind: "broker", accountKind: "securities", accountName: "港股", category: "hk_share", currency: "HKD" },
  { id: "ccbSavings", partyName: "建设银行", institutionKind: "bank", accountKind: "debit_card", accountName: "储蓄卡", category: "bank_deposit", currency: "CNY" },
  { id: "ccbCredit", partyName: "建设银行", institutionKind: "bank", accountKind: "credit_card", accountName: "信用卡", category: "credit_card", currency: "CNY" },
  { id: "spdbSavings", partyName: "浦发银行", institutionKind: "bank", accountKind: "debit_card", accountName: "储蓄卡", category: "bank_deposit", currency: "CNY" },
  { id: "spdbCredit", partyName: "浦发银行", institutionKind: "bank", accountKind: "credit_card", accountName: "信用卡", category: "credit_card", currency: "CNY" },
  { id: "cmbSavings", partyName: "招商银行", institutionKind: "bank", accountKind: "debit_card", accountName: "储蓄卡", category: "bank_deposit", currency: "CNY" },
  { id: "hsbc", partyName: "汇丰银行", institutionKind: "bank", accountKind: "debit_card", accountName: "汇丰香港", category: "bank_deposit", currency: "HKD" },
  { id: "housingFund", partyName: "公积金", institutionKind: "agency", accountKind: "housing_fund", accountName: "公积金", category: "housing_fund", currency: "CNY" },
  { id: "medical", partyName: "医保", institutionKind: "agency", accountKind: "medical", accountName: "医保余额", category: "medical", currency: "CNY" },
  { id: "wechat", partyName: "微信支付", institutionKind: "payment", accountKind: "wallet", accountName: "微信钱包", category: "wallet", currency: "CNY" },
  { id: "alipay", partyName: "支付宝", institutionKind: "payment", accountKind: "wallet", accountName: "支付宝", category: "wallet", currency: "CNY" },
  { id: "jpy", partyName: "外汇", institutionKind: "bank", accountKind: "fx", accountName: "日元", category: "fx", currency: "JPY" },
  { id: "krw", partyName: "外汇", institutionKind: "bank", accountKind: "fx", accountName: "韩元", category: "fx", currency: "KRW" },
  { id: "gold", partyName: "黄金", institutionKind: "other", accountKind: "gold", accountName: "黄金", category: "gold", currency: "CNY" },
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
