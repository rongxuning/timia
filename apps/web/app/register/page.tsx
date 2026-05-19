"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type RegisterResponse = { id: string; email: string; display_name: string };

function registerErrorMessage(detail: string): string {
  switch (detail) {
    case "email_taken":
      return "该邮箱已被注册";
    case "display_name_taken":
      return "该显示名称已被使用";
    case "password_too_short":
      return "密码至少 8 位";
    case "display_name_required":
      return "请输入显示名称";
    case "display_name_too_long":
      return "显示名称过长";
    default:
      return detail;
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalizedEmail = email.trim();
    const normalizedName = displayName.trim();
    if (!normalizedEmail) return setError("请输入邮箱");
    if (!normalizedName) return setError("请输入显示名");
    if (password.length < 8) return setError("密码至少 8 位");
    if (password !== confirmPassword) return setError("两次输入的密码不一致");

    setLoading(true);
    try {
      const res = await apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          display_name: normalizedName,
          password,
        }),
      });
      router.push(`/login?email=${encodeURIComponent(res.email)}`);
    } catch (err: any) {
      const detail = err?.message ?? "注册失败";
      setError(registerErrorMessage(detail));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-container-padding">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-surface-container-low/50 via-transparent to-primary-container/5" />

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="mb-2xl flex flex-col items-center">
          <div className="mb-md flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-white shadow-sm">
              <img alt="Timia 图标" src="/icons/icon-48.png" className="h-6.5 w-6.5 object-contain" />
            </div>
            <span className="font-headline text-subhead tracking-tight text-on-surface">Timia</span>
          </div>
          <h1 className="font-display text-section-heading text-center text-on-surface">创建账号</h1>
          <p className="mt-xs text-center font-body text-text-secondary">加入工作空间，开始协作</p>
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface p-3xl shadow-sm transition-shadow duration-300 hover:shadow-md">
          <form onSubmit={onSubmit} className="space-y-xl">
            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="email">
                邮箱
              </label>
              <div className="group relative">
                <input
                  id="email"
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="name@company.com"
                  type="email"
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                  mail
                </span>
              </div>
            </div>

            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="displayName">
                显示名称
              </label>
              <div className="group relative">
                <input
                  id="displayName"
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例如：王伟"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="password">
                密码
              </label>
              <div className="group relative">
                <input
                  id="password"
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位字符"
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                  lock
                </span>
              </div>
            </div>

            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="confirmPassword">
                确认密码
              </label>
              <div className="group relative">
                <input
                  id="confirmPassword"
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                  lock
                </span>
              </div>
            </div>

            {error && <div className="text-small text-error">{error}</div>}

            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-md font-section-heading text-body text-on-primary shadow-sm transition-all hover:-translate-y-px hover:bg-primary-hover active:scale-95 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "注册中…" : "创建账号"}
            </button>
          </form>

          <p className="mt-5xl text-center text-small text-text-secondary">
            已有账号？{" "}
            <a className="font-semibold text-primary underline-offset-4 hover:underline decoration-2" href="/login">
              去登录
            </a>
          </p>
        </div>
      </div>

      <footer className="fixed bottom-lg z-20 flex w-full flex-wrap items-center justify-center gap-x-lg gap-y-sm px-container-padding text-overline text-outline-variant">
        <span>© 2026 Timia</span>
        <div className="flex flex-wrap justify-center gap-lg">
          <a className="transition-colors hover:text-text-secondary" href="#">
            隐私
          </a>
          <a className="transition-colors hover:text-text-secondary" href="#">
            条款
          </a>
          <a className="transition-colors hover:text-text-secondary" href="#">
            安全
          </a>
        </div>
      </footer>
    </main>
  );
}
