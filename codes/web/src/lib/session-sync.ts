/**
 * Cross-tab auth broadcast.
 *
 * The refresh token is in an HttpOnly cookie (the server's responsibility).
 * The access token lives in memory in the current tab. When one tab refreshes
 * the AT successfully, other tabs need to know so they don't re-fire the same
 * refresh on their next request.
 *
 * `BroadcastChannel` is the modern API; we fall back to a `storage` event on
 * `localStorage` for browsers/contexts where `BroadcastChannel` is missing.
 */

export type SessionEvent =
  | { type: "auth-updated"; at: string; sessionId: string }
  | { type: "auth-cleared" };

const CHANNEL_NAME = "timia-auth";
const STORAGE_KEY = "timia_auth_broadcast";

let channel: BroadcastChannel | null = null;
const listeners = new Set<(e: SessionEvent) => void>();

function ensureChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (channel) return channel;
  if (typeof BroadcastChannel === "undefined") return null;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (msg: MessageEvent<SessionEvent>) => {
    if (msg.data && typeof msg.data === "object" && "type" in msg.data) {
      listeners.forEach((l) => l(msg.data));
    }
  };
  return channel;
}

function onStorageEvent(e: StorageEvent) {
  if (e.key !== STORAGE_KEY || !e.newValue) return;
  try {
    const parsed = JSON.parse(e.newValue) as SessionEvent;
    listeners.forEach((l) => l(parsed));
  } catch {
    /* ignore malformed payloads */
  }
}

let storageListenerBound = false;

export function publishSessionEvent(event: SessionEvent) {
  if (typeof window === "undefined") return;
  ensureChannel()?.postMessage(event);
  // `storage` only fires in *other* tabs, not the sender — perfect for cross-tab.
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...event, _t: Date.now() }));
  } catch {
    /* localStorage unavailable (private mode), BroadcastChannel still works */
  }
}

export function subscribeSessionEvents(listener: (e: SessionEvent) => void): () => void {
  listeners.add(listener);
  ensureChannel();
  if (typeof window !== "undefined" && !storageListenerBound) {
    window.addEventListener("storage", onStorageEvent);
    storageListenerBound = true;
  }
  return () => {
    listeners.delete(listener);
  };
}
