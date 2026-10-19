export type AssetKind = "asset" | "liability";
export type ExpenseGroup = "fixed" | "daily" | "emergency" | "other";

export type AssetAdjustment = {
  id: string;
  amount_minor: number;
  delta_minor: number;
  reason: string;
  recorded_at: string;
};

export type AssetHolding = {
  id: string;
  name: string;
  kind: AssetKind;
  category: string;
  currency: string;
  amount_minor: number;
  institution: string | null;
  note: string | null;
  adjusted_at: string;
  include_in_net_worth: boolean;
  needs_review: boolean;
  version: number;
  latest_reason: string | null;
  display_minor: number | null;
  fx_missing: boolean;
};

export type AssetHoldingDetail = AssetHolding & {
  adjustments: AssetAdjustment[];
};

export type AssetExpense = {
  id: string;
  group_kind: ExpenseGroup;
  name: string;
  currency: string;
  amount_minor: number;
  adjusted_at: string;
  version: number;
  latest_reason: string | null;
  display_minor: number | null;
  fx_missing: boolean;
};

export type AssetExpenseDetail = AssetExpense & {
  adjustments: AssetAdjustment[];
};

export type AssetProfile = {
  display_currency: string;
  version: number;
};

export type AssetFxRate = {
  currency: string;
  cny_per_unit: string;
  updated_at: string;
};

export type HoldingGroup = {
  kind: AssetKind;
  category: string;
  display_minor: number;
  fx_incomplete: boolean;
  holdings: AssetHolding[];
};

export type ExpenseGroupBlock = {
  group_kind: ExpenseGroup;
  display_minor: number;
  fx_incomplete: boolean;
  items: AssetExpense[];
};

export type AssetsSummary = {
  display_currency: string;
  total_assets_minor: number;
  total_liabilities_minor: number;
  net_worth_minor: number;
  spendable_net_worth_minor: number;
  emergency_cash_minor: number;
  credit_minor: number;
  investment_minor: number;
  restricted_minor: number;
  monthly_running_minor: number;
  emergency_reserve_minor: number;
  spending_total_minor: number;
  coverage_months: number | null;
  fx_incomplete: boolean;
  missing_currencies: string[];
  holding_count: number;
  needs_review_count: number;
  latest_adjusted_at: string | null;
  focus: string;
};

export type NetWorthPoint = {
  as_of: string;
  net_worth_minor: number;
};

export type MyAssetsView = {
  profile: AssetProfile;
  rates: AssetFxRate[];
  summary: AssetsSummary;
  groups: HoldingGroup[];
  expense_groups: ExpenseGroupBlock[];
  net_worth_series: NetWorthPoint[];
};

export type AssetHoldingInput = {
  name: string;
  kind: AssetKind;
  category: string;
  currency: string;
  amount_minor: number;
  institution?: string | null;
  note?: string | null;
  include_in_net_worth: boolean;
  reason: string;
  recorded_at?: string;
};

export type AssetAdjustmentInput = {
  version: number;
  amount_minor: number;
  reason: string;
  recorded_at?: string;
};

export type AssetExpenseInput = {
  name: string;
  group_kind: ExpenseGroup;
  currency: string;
  amount_minor: number;
  reason: string;
  recorded_at?: string;
};
