export const PLACE_NAME_MAX = 500;
export const PLACE_SEARCH_MIN_CHARS = 2;
export const PLACE_SEARCH_DEBOUNCE_MS = 300;

export type PlaceValue = {
  name: string;
  lat: number | null;
  lng: number | null;
};

export type ItemLocationFields = {
  location?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
};

export type ItemLocationPayload = {
  location: string | null;
  location_lat: number | null;
  location_lng: number | null;
};

export type GeoSearchHit = {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
};

export function emptyPlace(): PlaceValue {
  return { name: "", lat: null, lng: null };
}

export function isPinnedPlace(place: PlaceValue): boolean {
  return place.name.trim().length > 0 && place.lat != null && place.lng != null;
}

export function shouldSearchPlaces(query: string): boolean {
  return query.trim().length >= PLACE_SEARCH_MIN_CHARS;
}

export function placeFromItem(item: ItemLocationFields): PlaceValue {
  const name = (item.location ?? "").trim().slice(0, PLACE_NAME_MAX);
  const lat = item.location_lat ?? null;
  const lng = item.location_lng ?? null;
  if (name && lat != null && lng != null) {
    return { name, lat, lng };
  }
  return { name, lat: null, lng: null };
}

export function placeFromSearchHit(hit: GeoSearchHit): PlaceValue {
  return {
    name: hit.name.trim().slice(0, PLACE_NAME_MAX),
    lat: hit.lat,
    lng: hit.lng,
  };
}

export function placeFromFreeText(name: string): PlaceValue {
  return {
    name: name.slice(0, PLACE_NAME_MAX),
    lat: null,
    lng: null,
  };
}

export function itemLocationPayload(place: PlaceValue): ItemLocationPayload {
  const name = place.name.trim().slice(0, PLACE_NAME_MAX);
  if (!name) {
    return { location: null, location_lat: null, location_lng: null };
  }
  if (place.lat != null && place.lng != null) {
    return { location: name, location_lat: place.lat, location_lng: place.lng };
  }
  return { location: name, location_lat: null, location_lng: null };
}

export function createDebouncer(delayMs: number = PLACE_SEARCH_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule(fn: () => void) {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

export function geoSearchErrorKind(err: unknown): "rateLimited" | "unavailable" {
  const e = err as { status?: number; message?: string; name?: string } | null;
  if (e?.name === "AbortError") return "unavailable";
  if (e?.status === 429 || e?.message === "geo_rate_limited") return "rateLimited";
  return "unavailable";
}
