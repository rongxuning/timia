/**
 * Client-side auth state.
 *
 * The AT lives in memory (a module-level variable). It is **not** persisted:
 * closing the tab drops the AT, and the next request transparently refreshes
 * from the HttpOnly RT cookie. This is a deliberate trade for XSS safety.
 *
 * The RT is owned by the browser's cookie jar; JS never reads it. The server
 * is the only party that can see it.
 *
 * The `me` cache (display name, email) stays in `sessionStorage` so a hard
 * refresh re-renders the user identity without a roundtrip; it's keyed off the
 * sessionStorage lifetime, which we want to outlive a single navigation but
 * not a browser restart.
 */

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

// --- Access token: in-memory only ---------------------------------------

let accessToken: string | null = null;
let sessionId: string | null = null;
let accessTokenExpiresAt: number | null = null; // epoch ms

export function getAccessToken(): string | null {
  return accessToken;
}

/** @deprecated Use `getAccessToken`. Kept for callers that still import the old name. */
export const getToken = getAccessToken;

export function getSessionId(): string | null {
  return sessionId;
}

export function getAccessTokenExpiresAt(): number | null {
  return accessTokenExpiresAt;
}

export type AuthSnapshot = {
  token: string;
  sessionId: string;
  expiresAt: number; // epoch ms
};

export function publishAuth(snapshot: AuthSnapshot | null) {
  if (snapshot) {
    accessToken = snapshot.token;
    sessionId = snapshot.sessionId;
    accessTokenExpiresAt = snapshot.expiresAt;
  } else {
    accessToken = null;
    sessionId = null;
    accessTokenExpiresAt = null;
  }
}

// --- 401 handling gates -------------------------------------------------

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

/**
 * Backwards-compatible alias. Older components call `clearToken()` from the
 * logout button; this now clears the whole in-memory auth state and asks the
 * caller to also call the logout endpoint. The actual RT cookie clearing
 * happens server-side.
 */
export function clearToken() {
  publishAuth(null);
  clearCachedMe();
  resetAuthClientGates();
}

/**
 * Full logout: server-side revocation + local state wipe. Prefer this over
 * `clearToken()` from logout buttons so the RT cookie is actually killed.
 */
export async function logoutAndClear(): Promise<void> {
  try {
    await fetch("/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* network failure: still wipe local state, cookie will expire on its own */
  }
  publishAuth(null);
  clearCachedMe();
  resetAuthClientGates();
  // Best-effort: ask other tabs to drop their in-memory AT too.
  try {
    const ev = new BroadcastChannel("timia-auth");
    ev.postMessage({ type: "auth-cleared" });
    ev.close();
  } catch {
    /* BroadcastChannel unavailable in some test contexts; not fatal */
  }
}
