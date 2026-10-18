export type AssetKind = "asset" | "liability";

export type AssetHolding = {
  id: string;
  name: string;
  kind: AssetKind;
  category: string;
  amount_minor: number;
  institution: string | null;
  note: string | null;
  as_of: string;
  include_in_net_worth: boolean;
  needs_review: boolean;
  version: number;
};

export type AssetProfile = {
  currency: string;
  monthly_essential_minor: number | null;
  version: number;
  currency_locked: boolean;
};

export type AssetsSummary = {
  total_assets_minor: number;
  total_liabilities_minor: number;
  net_worth_minor: number;
  liquid_net_worth_minor: number;
  cash_minor: number;
  investment_minor: number;
  high_interest_debt_minor: number;
  debt_ratio: number | null;
  emergency_months: number | null;
  emergency_band: string;
  debt_band: string;
  needs_review_count: number;
  focus: string;
  holding_count: number;
  latest_as_of: string | null;
};

export type AllocationSlice = {
  kind: AssetKind;
  category: string;
  amount_minor: number;
  share: number;
};

export type NetWorthPoint = {
  as_of: string;
  net_worth_minor: number;
};

export type MyAssetsView = {
  profile: AssetProfile;
  summary: AssetsSummary;
  holdings: AssetHolding[];
  allocation: AllocationSlice[];
  net_worth_series: NetWorthPoint[];
};

export type AssetHoldingInput = {
  name: string;
  kind: AssetKind;
  category: string;
  amount_minor: number;
  institution?: string | null;
  note?: string | null;
  as_of: string;
  include_in_net_worth: boolean;
};

export type AssetProfileInput = {
  version: number;
  currency?: string;
  monthly_essential_minor?: number | null;
};
