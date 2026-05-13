import { clearToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
}

export type ApiError = {
  status: number;
  message: string;
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  const resp = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!resp.ok) {
    if (resp.status === 401 && options.token) {
      clearToken();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("nomia:session-expired"));
      }
    }
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
      // ignore
    }
    const err: ApiError = { status: resp.status, message: msg };
    throw err;
  }

  // Some endpoints (e.g. DELETE) may return 204 No Content or an empty body.
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

