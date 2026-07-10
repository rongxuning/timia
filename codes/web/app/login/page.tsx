"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { setToken } from "@/lib/auth";

type LoginResponse = { access_token: string; token_type: string };

/** 本地开发默认管理员（与 codes/core-service/app/scripts/seed.py 一致） */
const DEFAULT_LOGIN_EMAIL = "admin@gmail.com";
const DEFAULT_LOGIN_PASSWORD = "admin1234";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(DEFAULT_LOGIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_LOGIN_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const sessionExpired = params.get("reason") === "session-expired";

    if (emailParam) setEmail(emailParam);
    if (sessionExpired) {
      setSessionNotice("登录已过期，请重新登录。");
      params.delete("reason");
    }
    if (emailParam) params.delete("email");

    if (sessionExpired || emailParam) {
      const next = params.toString();
      const path = next ? `${window.location.pathname}?${next}` : window.location.pathname;
      window.history.replaceState(null, "", path);
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.access_token);
      router.push("/my/schedule");
    } catch (err: any) {
      setError(err?.message ?? "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-surface bg-[url('/login/background_4k.png')] bg-cover bg-center bg-no-repeat px-container-padding">
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="rounded-xl border-4 border-black bg-surface p-xl shadow-sm">
          <div className="mb-xl flex flex-col items-center">
            <span className="font-headline text-[40px] font-semibold leading-tight tracking-tight text-on-surface">Timia</span>
            <p className="mt-xs whitespace-nowrap text-center font-body text-caption text-text-secondary">
              合抱之木，生于毫末；九层之台，起于累土；千里之行，始于足下
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-lg">
            <div className="group relative">
              <input
                id="email"
                className="peer w-full rounded-xl border border-border-subtle bg-surface-bright px-md pb-sm pt-6 pr-10 text-body outline-none transition-all placeholder:text-transparent focus:border-primary focus:ring-4 focus:ring-primary/10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="Email"
                type="email"
              />
              <label
                htmlFor="email"
                className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2 font-body text-body text-outline-variant transition-all duration-200 peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-caption peer-focus:text-on-surface-variant peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-caption peer-[:not(:placeholder-shown)]:text-on-surface-variant"
              >
                Email
              </label>
              <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                mail
              </span>
            </div>

            <div className="group relative">
              <input
                id="password"
                className="peer w-full rounded-xl border border-border-subtle bg-surface-bright px-md pb-sm pt-6 pr-10 text-body outline-none transition-all placeholder:text-transparent focus:border-primary focus:ring-4 focus:ring-primary/10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Password"
              />
              <label
                htmlFor="password"
                className="pointer-events-none absolute left-md top-1/2 -translate-y-1/2 font-body text-body text-outline-variant transition-all duration-200 peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-caption peer-focus:text-on-surface-variant peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-caption peer-[:not(:placeholder-shown)]:text-on-surface-variant"
              >
                Password
              </label>
              <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                lock
              </span>
            </div>

            {sessionNotice && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-md py-sm text-small text-amber-900">
                {sessionNotice}
              </div>
            )}

            {error && <div className="text-small text-error">{error}</div>}

            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-sm font-section-heading text-body text-on-primary shadow-sm transition-colors hover:bg-primary-hover active:scale-95 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "登录中…" : "登录"}
            </button>

            <p className="text-center text-small text-text-secondary">
              还没有账号？{" "}
              <Link
                className="font-semibold text-primary underline-offset-4 hover:underline decoration-2"
                href="/register"
              >
                注册
              </Link>
            </p>
          </form>
        </div>
      </div>

      <footer className="absolute bottom-lg z-10 flex w-full flex-wrap items-center justify-center gap-x-lg gap-y-sm px-container-padding text-overline text-outline-variant">
        <span>Copyright © 2026 Timia</span>
        <div className="flex flex-wrap justify-center gap-lg">
          <a className="transition-colors hover:text-text-secondary" href="#">
            隐私
          </a>
        </div>
      </footer>
    </main>
  );
}
