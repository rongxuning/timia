"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { registerErrorKey } from "@/i18n/authErrors";
import { apiFetch } from "@/lib/api";

type RegisterResponse = { id: string; email: string; display_name: string };

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth");
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
    if (!normalizedEmail) return setError(t("needEmail"));
    if (!normalizedName) return setError(t("needDisplayName"));
    if (password.length < 8) return setError(t("passwordTooShort"));
    if (password !== confirmPassword) return setError(t("passwordMismatch"));

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
    } catch (err: unknown) {
      const detail = err && typeof err === "object" && "message" in err ? String(err.message) : "registerFailed";
      setError(t(registerErrorKey(detail)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-container-padding">
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-60" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-surface-container-low/50 via-transparent to-primary-container/5" />

      <div className="relative z-10 w-full max-w-[440px]">
        <div className="rounded-xl border border-border-subtle bg-surface p-3xl shadow-sm transition-shadow duration-300 hover:shadow-md">
          <h1 className="mb-xl font-display text-section-heading text-center text-on-surface">{t("createAccount")}</h1>
          <form onSubmit={onSubmit} className="space-y-xl">
            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="email">
                {t("email")}
              </label>
              <div className="group relative">
                <input
                  id="email"
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder={t("registerEmailPlaceholder")}
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
                {t("displayName")}
              </label>
              <div className="group relative">
                <input
                  id="displayName"
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t("displayNamePlaceholder")}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="password">
                {t("password")}
              </label>
              <div className="group relative">
                <input
                  id="password"
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("newPasswordPlaceholder")}
                  disabled={loading}
                />
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                  lock
                </span>
              </div>
            </div>

            <div className="space-y-xs">
              <label className="font-body text-small font-medium text-on-surface-variant" htmlFor="confirmPassword">
                {t("confirmPassword")}
              </label>
              <div className="group relative">
                <input
                  id="confirmPassword"
                  className="w-full rounded-xl border border-border-subtle bg-surface-bright px-lg py-md text-body outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("confirmPasswordPlaceholder")}
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
              {loading ? t("registering") : t("createAccount")}
            </button>
          </form>

          <p className="mt-5xl text-center text-small text-text-secondary">
            {t("hasAccount")}{" "}
            <a className="font-semibold text-primary underline-offset-4 hover:underline decoration-2" href="/login">
              {t("goLogin")}
            </a>
          </p>
        </div>
      </div>

      <footer className="absolute bottom-lg flex w-full flex-wrap items-center justify-center gap-x-lg gap-y-sm px-container-padding text-overline text-outline-variant">
        <span>{t("copyright")}</span>
        <LocaleSwitcher variant="footer" />
        <div className="flex flex-wrap justify-center gap-lg">
          <a className="transition-colors hover:text-text-secondary" href="#">
            {t("privacy")}
          </a>
        </div>
      </footer>
    </main>
  );
}
