/**
 * Fetch wrapper with automatic AT refresh on 401.
 *
 * Flow:
 *   1. Try the request with the current in-memory AT.
 *   2. If 401 and the path is not `/auth/*` itself, try `/auth/refresh` once.
 *      The RT cookie is sent automatically (credentials: "include"). The
 *      server rotates the RT and returns a fresh AT.
 *   3. If refresh succeeds, retry the original request with the new AT.
 *   4. If refresh fails (RT expired or revoked), wipe local state and redirect
 *      to /login with `?reason=session-expired`.
 *
 * Concurrent 401s are coalesced into a single refresh — without this, five
 * parallel requests would each kick off their own refresh, racing each other
 * and triggering the family-revocation logic.
 */

import {
  clearCachedMe,
  getAccessToken,
  publishAuth,
  redirectToLoginPage,
  takeSessionExpiredFrom401,
} from "./auth";
import { publishSessionEvent } from "./session-sync";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * Auth requests (`/auth/*`) are proxied through Next.js (dev) or the reverse
 * proxy (prod) so they hit the API as same-origin from the browser's
 * perspective. This keeps the `SameSite=Lax` RT cookie working across the
 * web (3000) → API (8000) port boundary in dev. Non-auth calls still use
 * the cross-origin `API_BASE_URL` because they don't carry cookies.
 */
function baseUrlFor(path: string): string {
  return path.startsWith("/auth/") ? "" : API_BASE_URL;
}

export type ApiError = {
  status: number;
  message: string;
};

export type ApiOptions = RequestInit & {
  token?: string;
  /** Set true for `/auth/refresh` so the 401 flow doesn't recurse into itself. */
  skipRefresh?: boolean;
};

let refreshingPromise: Promise<string | null> | null = null;

function genRequestId(): string {
  if (typeof crypto !== "undefined") {
    if ("randomUUID" in crypto) {
      return (crypto as Crypto).randomUUID().replace(/-/g, "");
    }
    const bytes = (crypto as Crypto).getRandomValues(new Uint8Array(24));
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Last-resort fallback. Should not run in any modern browser or Node 19+.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Try to refresh the access token. Returns the new AT or `null` if refresh
 * failed (which the caller treats as "session is dead"). The RT cookie is
 * included automatically; the server rotates it and returns the new AT in
 * the body.
 *
 * Multiple concurrent callers share the same in-flight promise.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshingPromise) return refreshingPromise;

  const promise = (async () => {
    try {
      const resp = await fetch(`${baseUrlFor("/auth/refresh")}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: genRequestId() }),
      });
      if (!resp.ok) return null;
      const body = (await resp.json()) as {
        access_token: string;
        expires_in: number;
        session_id: string;
      };
      const expiresAt = Date.now() + body.expires_in * 1000;
      publishAuth({
        token: body.access_token,
        sessionId: body.session_id,
        expiresAt,
      });
      publishSessionEvent({
        type: "auth-updated",
        at: body.access_token,
        sessionId: body.session_id,
      });
      return body.access_token;
    } catch {
      return null;
    } finally {
      refreshingPromise = null;
    }
  })();

  refreshingPromise = promise;
  return promise;
}

/**
 * Bring the in-memory AT back in sync with the HttpOnly RT cookie.
 *
 * Call this on app mount. The AT lives in memory only, so a hard refresh
 * wipes it even when the RT cookie is still valid. Without this, the route
 * guard would see `getAccessToken() === null` and bounce the user to /login
 * before any API call has a chance to refresh.
 *
 * The server identifies the session by the RT cookie alone (no X-Session-Id
 * needed), so this works on a hard refresh, in a new tab, and after the
 * browser restarts — as long as the RT cookie is still valid.
 *
 * Returns `true` if the user has a valid session (AT now in memory), `false`
 * if the RT is missing or revoked and the user must sign in again.
 */
export async function bootstrapSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (getAccessToken()) {
    console.debug("[auth] bootstrap: AT already in memory, skip refresh");
    return true;
  }
  console.debug("[auth] bootstrap: AT missing, attempting silent refresh");
  const token = await refreshAccessToken();
  if (token) {
    console.debug("[auth] bootstrap: refresh OK, AT in memory");
    return true;
  }
  console.warn("[auth] bootstrap: refresh FAILED — RT cookie missing, expired, or revoked");
  return false;
}

function buildHeaders(options: ApiOptions, tokenOverride?: string) {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = tokenOverride ?? options.token ?? getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

function isAuthPath(path: string): boolean {
  return path.startsWith("/auth/");
}

async function parseError(resp: Response): Promise<string> {
  let msg = resp.statusText;
  try {
    const data = await resp.json();
    const detail = data?.detail;
    if (typeof detail === "string") {
      msg = detail;
    } else if (Array.isArray(detail)) {
      msg = detail.map((d: any) => d?.msg ?? d?.message ?? JSON.stringify(d)).join("; ");
    } else if (detail != null) {
      msg = typeof detail === "object" ? JSON.stringify(detail) : String(detail);
    }
  } catch {
    /* ignore */
  }
  return msg;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  // The `/auth/refresh` request is the only call we want to keep simple —
  // its own 401 means the RT itself is dead, not just the AT.
  if (options.skipRefresh) {
    return directFetch<T>(path, options);
  }

  const resp = await fetch(`${baseUrlFor(path)}${path}`, {
    ...options,
    credentials: "include",
    headers: buildHeaders(options),
  });

  if (resp.status !== 401) {
    if (!resp.ok) {
      const message = await parseError(resp);
      const err: ApiError = { status: resp.status, message };
      throw err;
    }
    if (resp.status === 204) return undefined as T;
    const text = await resp.text();
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  // 401 path. Don't try to refresh auth endpoints themselves.
  if (isAuthPath(path)) {
    const message = await parseError(resp);
    throw { status: 401, message } as ApiError;
  }

  // Try a single refresh, then retry the original request.
  const newToken = await refreshAccessToken();
  if (!newToken) {
    // Refresh failed: surface a 401 and let the caller (or route guard) handle logout.
    if (takeSessionExpiredFrom401()) {
      clearCachedMe();
      publishAuth(null);
      redirectToLoginPage({ reason: "session-expired" });
    }
    throw { status: 401, message: "session_expired" } as ApiError;
  }

  const retry = await fetch(`${baseUrlFor(path)}${path}`, {
    ...options,
    credentials: "include",
    headers: buildHeaders(options, newToken),
  });
  if (!retry.ok) {
    const message = await parseError(retry);
    const err: ApiError = { status: retry.status, message };
    throw err;
  }
  if (retry.status === 204) return undefined as T;
  const text = await retry.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function directFetch<T>(path: string, options: ApiOptions): Promise<T> {
  const resp = await fetch(`${baseUrlFor(path)}${path}`, {
    ...options,
    credentials: "include",
    headers: buildHeaders(options),
  });
  if (!resp.ok) {
    const message = await parseError(resp);
    throw { status: resp.status, message } as ApiError;
  }
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
