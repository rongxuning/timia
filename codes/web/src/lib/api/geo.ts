import { apiFetch, type ApiOptions } from "@/lib/api";

export type GeoPlace = {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
};

export type GeoPlaces = {
  items: GeoPlace[];
};

export function searchGeoPlaces(
  token: string,
  q: string,
  limit = 8,
  init: Pick<ApiOptions, "signal"> = {},
): Promise<GeoPlaces> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  return apiFetch<GeoPlaces>(`/geo/places?${params.toString()}`, { token, signal: init.signal });
}
