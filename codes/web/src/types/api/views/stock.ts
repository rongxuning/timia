export type StockMarket = "a_share" | "hk_share";
export type StockTransferDirection = "bank_to_securities" | "securities_to_bank";

export type StockFlow = {
  display_currency: string;
  fx_incomplete: boolean;
  net_assets_minor: number;
  total_cost_minor: number;
  total_assets_minor: number;
  market_value_minor: number;
  cash_minor: number;
  liability_minor: number;
  show_liability: boolean;
  gain_minor: number;
  show_gain: boolean;
  bank_to_securities_minor: number;
  securities_to_bank_minor: number;
};

export type StockPosition = {
  id: string;
  symbol: string;
  name: string;
  market: StockMarket;
  currency: string;
  shares: number;
  cost_price_minor: number;
  market_price_minor: number;
  market_value_minor: number | null;
  total_pnl_minor: number | null;
  period_pnl_minor: number | null;
  fx_missing: boolean;
  version: number;
};

export type StockSeriesPoint = {
  as_of: string;
  net_assets_minor: number;
  total_cost_minor: number;
  market_value_minor: number;
  cash_minor: number;
  liability_minor: number;
  gain_minor: number;
  positions: { id: string; name: string; market_value_minor: number }[];
};

export type StockDetail = {
  account: { id: string; name: string; code: string; account_number: string | null };
  flow: StockFlow;
  positions: StockPosition[];
  series: StockSeriesPoint[];
};

export type StockPositionWrite = {
  id: string;
  symbol: string;
  name: string;
  market: StockMarket;
  currency: string;
  shares: number;
  cost_price_minor: number;
  market_price_minor: number;
  version: number;
};
