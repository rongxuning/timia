"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type RegisterResponse = { id: string; email: string; display_name: string };

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
      setError(err?.message ?? "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-container-padding relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-60 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-tr from-surface-container-low/50 via-transparent to-primary-container/5 pointer-events-none" />

      <div className="w-full max-w-[440px] relative z-10">
        <div className="mb-8xl flex flex-col items-center">
          <div className="flex items-center gap-2 mb-lg">
            <div className="w-10 h-10 bg-primary flex items-center justify-center rounded-xl">
              <span
                className="material-symbols-outlined text-white"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                dataset
              </span>
            </div>
            <span className="font-headline text-subhead tracking-tight text-on-surface">Timia</span>
          </div>

          <h1 className="font-display text-section-heading text-center text-on-surface">创建账号</h1>
          <p className="font-body text-text-secondary mt-xs">加入工作空间，开始协作</p>
        </div>

        <div className="bg-surface border border-border-subtle rounded-xl p-3xl shadow-sm hover:shadow-md transition-shadow duration-300">
          <form onSubmit={onSubmit} className="space-y-xl">
            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="email">
                邮箱
              </label>
              <div className="relative group">
                <input
                  id="email"
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="name@company.com"
                  type="email"
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors">
                  mail
                </span>
              </div>
            </div>

            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="displayName">
                显示名称
              </label>
              <div className="relative group">
                <input
                  id="displayName"
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="例如：王伟"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-xs">
              <div className="flex justify-between items-center">
                <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="password">
                  密码
                </label>
              </div>
              <div className="relative group">
                <input
                  id="password"
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="至少 8 位字符"
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors">
                  lock
                </span>
              </div>
            </div>

            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="confirmPassword">
                确认密码
              </label>
              <div className="relative group">
                <input
                  id="confirmPassword"
                  className="w-full bg-surface-bright border border-border-subtle rounded-xl px-lg py-md text-body focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant group-focus-within:text-primary transition-colors">
                  lock
                </span>
              </div>
            </div>

            {error && <div className="text-small text-error">{error}</div>}

            <button
              type="submit"
              className="w-full bg-primary text-on-primary font-section-heading text-body py-md rounded-xl hover:bg-primary-hover hover:-translate-y-px active:scale-95 transition-all shadow-sm disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "注册中…" : "创建账号"}
            </button>
          </form>

          <p className="text-center mt-5xl text-small text-text-secondary">
            已有账号？{" "}
            <a className="text-primary font-semibold hover:underline decoration-2 underline-offset-4" href="/login">
              去登录
            </a>
          </p>
        </div>
      </div>

      <footer className="fixed bottom-lg w-full px-container-padding flex justify-between items-center text-overline text-outline-variant">
        <span>© 2026 Timia</span>
        <div className="flex gap-lg">
          <a className="hover:text-text-secondary transition-colors" href="#">
            隐私
          </a>
          <a className="hover:text-text-secondary transition-colors" href="#">
            条款
          </a>
          <a className="hover:text-text-secondary transition-colors" href="#">
            安全
          </a>
        </div>
      </footer>
    </main>
  );
}

