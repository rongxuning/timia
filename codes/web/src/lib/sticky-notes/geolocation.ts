/**
 * Browser geolocation helper. Returns a snapshot suitable for the sticky-note
 * location field, or `null` if the user has denied / not granted permission.
 */

export type LocationSnapshot = {
  lat: number;
  lng: number;
  accuracy_m: number | null;
  name: string | null;
  source: "gps";
};

const LS_KEY = "timia.sticky-notes.location-preference";

export function getLocationPreference(): "prompt" | "denied" | "always" {
  if (typeof localStorage === "undefined") return "prompt";
  return (localStorage.getItem(LS_KEY) as "prompt" | "denied" | "always" | null) ?? "prompt";
}

export function setLocationPreference(value: "prompt" | "denied" | "always") {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LS_KEY, value);
  }
}

export function isGeolocationAvailable(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export async function requestCurrentLocation(): Promise<LocationSnapshot | null> {
  if (!isGeolocationAvailable()) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy ?? null,
          name: null,
          source: "gps",
        }),
      () => {
        // First denial → record so we don't keep pestering
        setLocationPreference("denied");
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  });
}
