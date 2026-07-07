const TOKEN_KEY = "timia_access_token";
const ME_CACHE_KEY = "timia_me_cache";

export type CachedMe = {
  id: string;
  email: string;
  display_name: string;
  system_role: string;
};

export function getCachedMe(): CachedMe | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ME_CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedMe) : null;
  } catch {
    return null;
  }
}

let meSnapshot: CachedMe | null = null;
const meListeners = new Set<() => void>();

export function subscribeMe(listener: () => void) {
  meListeners.add(listener);
  return () => meListeners.delete(listener);
}

function notifyMeListeners() {
  meListeners.forEach((listener) => listener());
}

export function getMeClientSnapshot(): CachedMe | null {
  if (!meSnapshot) {
    meSnapshot = getCachedMe();
  }
  return meSnapshot;
}

export function getMeServerSnapshot(): CachedMe | null {
  return null;
}

/** @deprecated Use getMeClientSnapshot in client code. */
export function getMeSnapshot(): CachedMe | null {
  return getMeClientSnapshot();
}

export function publishMe(me: CachedMe | null) {
  if (me) {
    setCachedMe(me);
  } else {
    clearCachedMe();
  }
}

export function setMeSnapshot(me: CachedMe) {
  meSnapshot = me;
}

export function clearMeSnapshot() {
  meSnapshot = null;
}

export function setCachedMe(me: CachedMe) {
  if (typeof window === "undefined") return;
  meSnapshot = me;
  window.sessionStorage.setItem(ME_CACHE_KEY, JSON.stringify(me));
  notifyMeListeners();
}

export function clearCachedMe() {
  if (typeof window === "undefined") return;
  clearMeSnapshot();
  window.sessionStorage.removeItem(ME_CACHE_KEY);
  notifyMeListeners();
}

/** Set on first 401 with Authorization; cleared on successful login. Coalesces parallel 401 redirects. */
let sessionExpiredHandled = false;

function resetAuthClientGates() {
  sessionExpiredHandled = false;
}

/** Returns true the first time after access token auth fails; subsequent 401s should no-op. */
export function takeSessionExpiredFrom401(): boolean {
  if (sessionExpiredHandled) return false;
  sessionExpiredHandled = true;
  return true;
}

/** When token is already gone (e.g. route guard), use this to preserve `?reason=session-expired` after a 401 burst. */
export function loginRedirectReasonWhenUnauthenticated(): "session-expired" | "missing-token" {
  return sessionExpiredHandled ? "session-expired" : "missing-token";
}

export function redirectToLoginPage(opts?: { reason?: "session-expired" | "missing-token" }) {
  if (typeof window === "undefined") return;
  const reason = opts?.reason ?? "missing-token";
  const q = reason === "session-expired" ? "?reason=session-expired" : "";
  window.location.replace(`/login${q}`);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  resetAuthClientGates();
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  clearCachedMe();
}

