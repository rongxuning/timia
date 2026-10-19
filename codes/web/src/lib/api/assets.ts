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

export function fetchMyAssets(token: string): Promise<MyAssetsView> {
  return apiFetch<MyAssetsView>("/views/me/assets", { token });
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
