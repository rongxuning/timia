const TOKEN_KEY = "timia_access_token";

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
}

