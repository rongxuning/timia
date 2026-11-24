import { apiFetch } from "@/lib/api";
import type {
  AssetAdjustmentInput,
  AssetExpense,
  AssetExpenseDetail,
  AssetExpenseInput,
  AssetFxRate,
  AssetHolding,
  AssetHoldingDetail,
  AssetHoldingInput,
  AssetProfile,
  MyAssetsView,
} from "@/types/api/views/assets";
import type {
  BankDetail,
  BankProductKind,
  BankProductWrite,
} from "@/types/api/views/bank";
import type {
  StockDetail,
  StockMarket,
  StockPositionWrite,
  StockTransferDirection,
} from "@/types/api/views/stock";

export function fetchMyAssets(token: string): Promise<MyAssetsView> {
  return apiFetch<MyAssetsView>("/views/me/assets", { token });
}

export type LedgerAccountKind = "savings" | "credit" | "stock" | "metal" | "forex";

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  account_kind: LedgerAccountKind;
  account_number: string;
  version: number;
};

export function createAssetAccount(
  token: string,
  body: { name: string; account_kind: LedgerAccountKind; account_number: string },
): Promise<LedgerAccount> {
  return apiFetch<LedgerAccount>("/asset-accounts", {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function openAssetBook(
  token: string,
  body: {
    party_id?: string;
    party_name?: string;
    institution_kind?: string;
    account_id?: string;
    account_name?: string;
    account_kind?: string;
    card_number?: string | null;
    asset_account_no?: string | null;
    account_number?: string | null;
    balance_name: string;
    category: string;
    currency: string;
    amount_minor: number;
    include_in_net_worth?: boolean;
    reason: string;
    recorded_at?: string;
  },
): Promise<{ party_id: string; party_code: string; account_id: string; account_code: string; holding: AssetHolding }> {
  return apiFetch("/asset-book/open", {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createAssetHolding(token: string, body: AssetHoldingInput): Promise<AssetHolding> {
  return apiFetch<AssetHolding>("/asset-holdings", {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAssetHolding(
  token: string,
  id: string,
  body: {
    version: number;
    name?: string;
    institution?: string | null;
    note?: string | null;
    include_in_net_worth?: boolean;
    category?: string;
    kind?: AssetHoldingInput["kind"];
  },
): Promise<AssetHolding> {
  return apiFetch<AssetHolding>(`/asset-holdings/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function adjustAssetHolding(
  token: string,
  id: string,
  body: AssetAdjustmentInput,
): Promise<AssetHolding> {
  return apiFetch<AssetHolding>(`/asset-holdings/${id}/adjustments`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchAssetHolding(token: string, id: string): Promise<AssetHoldingDetail> {
  return apiFetch<AssetHoldingDetail>(`/asset-holdings/${id}`, { token });
}

export function archiveAssetHolding(
  token: string,
  id: string,
  body: { version: number; reason: string },
): Promise<void> {
  return apiFetch<void>(`/asset-holdings/${id}/archive`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateAssetProfile(
  token: string,
  body: { version: number; display_currency: string },
): Promise<AssetProfile> {
  return apiFetch<AssetProfile>("/asset-profile", {
    token,
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function upsertFxRate(
  token: string,
  body: { currency: string; cny_per_unit: string },
): Promise<AssetFxRate> {
  return apiFetch<AssetFxRate>("/asset-fx-rates", {
    token,
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function createAssetExpense(token: string, body: AssetExpenseInput): Promise<AssetExpense> {
  return apiFetch<AssetExpense>("/asset-expenses", {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function adjustAssetExpense(
  token: string,
  id: string,
  body: AssetAdjustmentInput,
): Promise<AssetExpense> {
  return apiFetch<AssetExpense>(`/asset-expenses/${id}/adjustments`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchAssetExpense(token: string, id: string): Promise<AssetExpenseDetail> {
  return apiFetch<AssetExpenseDetail>(`/asset-expenses/${id}`, { token });
}

export function fetchStockDetail(
  token: string,
  accountId: string,
  start: string,
  end: string,
  timeZone: string,
): Promise<StockDetail> {
  const query = new URLSearchParams({ start, end, timezone: timeZone });
  return apiFetch<StockDetail>(`/views/me/assets/accounts/${accountId}/stocks?${query}`, { token });
}

export function fetchBankDetail(
  token: string,
  accountId: string,
  start: string,
  end: string,
  timeZone: string,
  productId?: string | null,
): Promise<BankDetail> {
  const query = new URLSearchParams({ start, end, timezone: timeZone });
  if (productId) query.set("product_id", productId);
  return apiFetch<BankDetail>(`/views/me/assets/accounts/${accountId}/bank?${query}`, { token });
}

export function createBankProduct(
  token: string,
  accountId: string,
  body: {
    name: string;
    product_kind: BankProductKind;
    currency?: string;
    balance_minor?: number;
    value_minor?: number;
    cost_minor?: number;
    limit_minor?: number;
    statement_minor?: number;
    paid_off?: boolean;
    reason: string;
    recorded_at?: string;
    timezone?: string;
  },
): Promise<BankProductWrite> {
  return apiFetch<BankProductWrite>(`/asset-accounts/${accountId}/bank-products`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createBankFlow(
  token: string,
  accountId: string,
  body: {
    direction: "income" | "expense";
    category: string;
    amount_minor: number;
    currency?: string;
    recorded_at?: string;
  },
): Promise<void> {
  return apiFetch<void>(`/asset-accounts/${accountId}/bank-flows`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createBankSavingsTxn(
  token: string,
  accountId: string,
  productId: string,
  body: {
    version: number;
    balance_minor: number;
    reason: string;
    recorded_at?: string;
    timezone?: string;
  },
): Promise<BankProductWrite> {
  return apiFetch<BankProductWrite>(
    `/asset-accounts/${accountId}/bank-products/${productId}/savings-txns`,
    { token, method: "POST", body: JSON.stringify(body) },
  );
}

export function createBankInvestmentOp(
  token: string,
  accountId: string,
  productId: string,
  body: {
    version: number;
    value_minor: number;
    cost_minor: number;
    reason: string;
    recorded_at?: string;
    timezone?: string;
  },
): Promise<BankProductWrite> {
  return apiFetch<BankProductWrite>(
    `/asset-accounts/${accountId}/bank-products/${productId}/investment-ops`,
    { token, method: "POST", body: JSON.stringify(body) },
  );
}

export function createBankCreditBill(
  token: string,
  accountId: string,
  productId: string,
  body: {
    version: number;
    year_month: string;
    limit_minor: number;
    statement_minor: number;
    paid_off: boolean;
    reason: string;
    recorded_at?: string;
  },
): Promise<BankProductWrite> {
  return apiFetch<BankProductWrite>(
    `/asset-accounts/${accountId}/bank-products/${productId}/credit-bills`,
    { token, method: "POST", body: JSON.stringify(body) },
  );
}

export function createStockPosition(
  token: string,
  accountId: string,
  body: {
    symbol: string;
    name: string;
    market: StockMarket;
    shares: number;
    cost_price_minor: number;
    market_price_minor: number;
    reason: string;
    recorded_at?: string;
  },
): Promise<StockPositionWrite> {
  return apiFetch<StockPositionWrite>(`/asset-accounts/${accountId}/stocks`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function markStockPosition(
  token: string,
  accountId: string,
  positionId: string,
  body: {
    version: number;
    shares: number;
    cost_price_minor: number;
    market_price_minor: number;
    reason: string;
    recorded_at?: string;
    timezone?: string;
  },
): Promise<StockPositionWrite> {
  return apiFetch<StockPositionWrite>(`/asset-accounts/${accountId}/stocks/${positionId}/marks`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setStockCash(
  token: string,
  accountId: string,
  body: { currency: string; amount_minor: number; reason: string; recorded_at?: string },
): Promise<void> {
  return apiFetch<void>(`/asset-accounts/${accountId}/stock-cash`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setStockFrozen(
  token: string,
  accountId: string,
  body: { currency: string; amount_minor: number; reason: string; recorded_at?: string },
): Promise<void> {
  return apiFetch<void>(`/asset-accounts/${accountId}/stock-frozen`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createStockTransfer(
  token: string,
  accountId: string,
  body: {
    direction: StockTransferDirection;
    currency: string;
    amount_minor: number;
    reason: string;
    recorded_at?: string;
  },
): Promise<void> {
  return apiFetch<void>(`/asset-accounts/${accountId}/stock-transfers`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function archiveAssetExpense(
  token: string,
  id: string,
  body: { version: number; reason: string },
): Promise<void> {
  return apiFetch<void>(`/asset-expenses/${id}/archive`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}
