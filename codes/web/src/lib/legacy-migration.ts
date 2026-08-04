/**
 * One-time cleanup of the old single-token localStorage key.
 *
 * Pre-`web-long-session` builds stored the access token in
 * `localStorage["timia_access_token"]`. After deploy, those tokens are
 * unverifiable on the server (the audience / session_id mismatch), so we
 * proactively drop them on first load. Users will be redirected to /login
 * by the route guard, exactly like any other unauthenticated state.
 */

const OLD_TOKEN_KEYS = ["timia_access_token"];

export function purgeLegacyAuthState() {
  if (typeof window === "undefined") return;
  for (const key of OLD_TOKEN_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* private mode etc. */
    }
  }
}
