import { apiFetch } from "@/lib/api";
import type {
  AssetHolding,
  AssetHoldingInput,
  AssetProfile,
  AssetProfileInput,
  MyAssetsView,
} from "@/types/api/views/assets";

export function fetchMyAssets(token: string): Promise<MyAssetsView> {
  return apiFetch<MyAssetsView>("/views/me/assets", { token });
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
  body: AssetHoldingInput & { version: number },
): Promise<AssetHolding> {
  return apiFetch<AssetHolding>(`/asset-holdings/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function confirmAssetHolding(
  token: string,
  id: string,
  body: { version: number; as_of: string },
): Promise<AssetHolding> {
  return apiFetch<AssetHolding>(`/asset-holdings/${id}/confirm`, {
    token,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function archiveAssetHolding(token: string, id: string, version: number): Promise<void> {
  return apiFetch<void>(`/asset-holdings/${id}/archive`, {
    token,
    method: "POST",
    body: JSON.stringify({ version }),
  });
}

export function updateAssetProfile(token: string, body: AssetProfileInput): Promise<AssetProfile> {
  return apiFetch<AssetProfile>("/asset-profile", {
    token,
    method: "PUT",
    body: JSON.stringify(body),
  });
}
