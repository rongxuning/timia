export type BankProductKind = "savings" | "investment" | "credit";

export type BankAccount = {
  id: string;
  name: string;
  code: string;
  account_kind: string;
  account_number: string | null;
};

export type BankSummary = {
  display_currency: string;
  fx_incomplete: boolean;
  total_assets_minor: number;
  income_minor: number;
  expense_minor: number;
};

export type BankFlowDirection = "income" | "expense";

export type BankFlow = {
  id: string;
  direction: BankFlowDirection;
  category: string;
  currency: string;
  amount_minor: number;
  display_minor: number | null;
  recorded_at: string;
};

export type BankProduct = {
  id: string;
  name: string;
  product_kind: BankProductKind;
  currency: string;
  balance_minor: number;
  value_minor: number;
  cost_minor: number;
  floating_pnl_minor: number | null;
  limit_minor: number;
  statement_minor: number;
  paid_off: boolean;
  fx_missing: boolean;
  version: number;
  recorded_at: string;
  current_balance_minor: number;
  current_value_minor: number;
  current_cost_minor: number;
  current_limit_minor: number;
  current_statement_minor: number;
};

export type BankSeriesPoint = {
  as_of: string;
  total_assets_minor: number;
};

export type BankProductSeriesPoint = {
  as_of: string;
  primary_minor: number;
  secondary_minor: number | null;
};

export type BankSavingsTxn = {
  id: string;
  balance_minor: number;
  delta_minor: number;
  reason: string;
  recorded_at: string;
};

export type BankInvestmentOp = {
  id: string;
  value_minor: number;
  cost_minor: number;
  cost_delta_minor: number;
  reason: string;
  recorded_at: string;
};

export type BankCreditBill = {
  id: string;
  year_month: string;
  limit_minor: number;
  statement_minor: number;
  paid_off: boolean;
  reason: string;
  recorded_at: string;
};

export type BankProductDetail = {
  product: BankProduct;
  series: BankProductSeriesPoint[];
  savings_txns: BankSavingsTxn[];
  investment_ops: BankInvestmentOp[];
  credit_bills: BankCreditBill[];
};

export type BankDetail = {
  account: BankAccount;
  summary: BankSummary;
  products: BankProduct[];
  series: BankSeriesPoint[];
  flows: BankFlow[];
  selected: BankProductDetail | null;
};

export type BankProductWrite = {
  id: string;
  name: string;
  product_kind: BankProductKind;
  currency: string;
  balance_minor: number;
  value_minor: number;
  cost_minor: number;
  limit_minor: number;
  statement_minor: number;
  paid_off: boolean;
  version: number;
};
