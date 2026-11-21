"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { loginErrorKey, phoneLoginErrorKey } from "@/i18n/authErrors";
import { apiFetch } from "@/lib/api";
import { publishAuth } from "@/lib/auth";
import { publishSessionEvent } from "@/lib/session-sync";
import { purgeLegacyAuthState } from "@/lib/legacy-migration";

type LoginResponse = {
  access_token: string;
  expires_in: number;
  session_id: string;
  refresh_token_expires_at: string;
};
type DevelopmentLoginResponse = { email: string; password: string };
type PhoneChallenge = { challenge_id: string; nonce: string };
type PhoneCodeResponse = PhoneChallenge & { dev_code?: string | null };
type Method = "email" | "phone";

const fieldClass =
  "peer w-full rounded-xl border border-border-subtle bg-surface-bright px-md pb-sm pt-6 text-body outline-none transition-all placeholder:text-transparent focus:border-primary focus:ring-4 focus:ring-primary/10";
const labelClass =
  "pointer-events-none absolute left-md top-1/2 -translate-y-1/2 font-body text-body text-outline-variant transition-all duration-200 peer-focus:top-3 peer-focus:translate-y-0 peer-focus:text-caption peer-focus:text-on-surface-variant peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-caption peer-[:not(:placeholder-shown)]:text-on-surface-variant";

function looksLikePhone(value: string) {
  const compact = value.replace(/[\s-]/g, "");
  return /^\+?[0-9]{8,15}$/.test(compact);
}

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [method, setMethod] = useState<Method>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [codeCooldown, setCodeCooldown] = useState(0);
  const [sendingCode, setSendingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (codeCooldown <= 0) return;
    const timer = window.setTimeout(() => setCodeCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [codeCooldown]);

  useEffect(() => {
    purgeLegacyAuthState();
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get("email");
    const sessionExpired = params.get("reason") === "session-expired";

    if (emailParam) setEmail(emailParam);
    if (sessionExpired) {
      setSessionNotice(t("sessionExpired"));
      params.delete("reason");
    }
    if (emailParam) params.delete("email");

    const wechatReturn = params.get("wechat") === "1";
    const googleReturn = params.get("google") === "1";
    const wechatError = params.get("wechat_error");
    const googleError = params.get("google_error");
    if (wechatReturn) params.delete("wechat");
    if (googleReturn) params.delete("google");
    if (wechatError) {
      setError(wechatError === "provider_not_configured" ? t("providerNotConfigured") : t("wechatFailed"));
      params.delete("wechat_error");
    }
    if (googleError) {
      setError(googleError === "provider_not_configured" ? t("providerNotConfigured") : t("googleFailed"));
      params.delete("google_error");
    }

    if (sessionExpired || emailParam || wechatReturn || googleReturn || wechatError || googleError) {
      const next = params.toString();
      const path = next ? `${window.location.pathname}?${next}` : window.location.pathname;
      window.history.replaceState(null, "", path);
    }
    if (wechatReturn || googleReturn) {
      const requestId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID().replace(/-/g, "")
          : `${Date.now().toString(16)}aaaaaaaaaaaaaaaa`.slice(0, 32);
      const failed = wechatReturn ? t("wechatFailed") : t("googleFailed");
      void apiFetch<LoginResponse>("/auth/refresh", {
        method: "POST",
        skipRefresh: true,
        body: JSON.stringify({ request_id: requestId }),
      })
        .then((res) => {
          publishAuth({
            token: res.access_token,
            sessionId: res.session_id,
            expiresAt: Date.now() + res.expires_in * 1000,
          });
          publishSessionEvent({
            type: "auth-updated",
            at: res.access_token,
            sessionId: res.session_id,
          });
          router.push("/my/schedule");
        })
        .catch(() => setError(failed));
    }

    if (process.env.NODE_ENV === "development") {
      void fetch("/api/development-login", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((login: DevelopmentLoginResponse | null) => {
          if (!login) return;
          if (!emailParam) setEmail(login.email);
          setPassword(login.password);
        });
    }
  }, [router, t]);

  function finishLogin(res: LoginResponse) {
    publishAuth({
      token: res.access_token,
      sessionId: res.session_id,
      expiresAt: Date.now() + res.expires_in * 1000,
    });
    publishSessionEvent({
      type: "auth-updated",
      at: res.access_token,
      sessionId: res.session_id,
    });
    router.push("/my/schedule");
  }

  async function sendCode() {
    setError(null);
    const normalized = phone.trim();
    if (!looksLikePhone(normalized)) {
      setError(t("invalidPhone"));
      return;
    }
    setSendingCode(true);
    try {
      const sent = await apiFetch<PhoneCodeResponse>("/auth/login/phone/code", {
        method: "POST",
        body: JSON.stringify({ phone: normalized }),
      });
      setChallenge({ challenge_id: sent.challenge_id, nonce: sent.nonce });
      setCodeCooldown(60);
      if (process.env.NODE_ENV === "development" && sent.dev_code) {
        setCode(sent.dev_code);
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && (err as { message?: string }).message === "resend_too_soon") {
        setCodeCooldown(60);
      }
      setError(t(phoneLoginErrorKey(err)));
    } finally {
      setSendingCode(false);
    }
  }

  async function submitPhone() {
    const normalized = phone.trim();
    const normalizedCode = code.trim();
    if (!looksLikePhone(normalized)) {
      setError(t("invalidPhone"));
      return;
    }
    if (!challenge) {
      setError(t("needCodeFirst"));
      return;
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      setError(t("needVerificationCode"));
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/auth/login/phone/verify", {
        method: "POST",
        body: JSON.stringify({
          phone: normalized,
          code: normalizedCode,
          challenge_id: challenge.challenge_id,
          nonce: challenge.nonce,
        }),
      });
      finishLogin(res);
    } catch (err: unknown) {
      setError(t(phoneLoginErrorKey(err)));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (method === "phone") {
      await submitPhone();
      return;
    }
    const normalizedEmail = email.trim();
    if (!normalizedEmail && !password) {
      setError(t("needEmailAndPassword"));
      return;
    }
    if (!normalizedEmail) {
      setError(t("needEmail"));
      return;
    }
    if (!password) {
      setError(t("needPassword"));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t("invalidEmail"));
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      finishLogin(res);
    } catch (err: unknown) {
      setError(t(loginErrorKey(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-surface bg-[url('/login/background_2k.png')] bg-cover bg-center bg-no-repeat px-container-padding">
      <div className="relative z-10 w-full max-w-[440px]">
        <div className="rounded-xl border-4 border-black bg-surface p-xl shadow-sm">
          <div className="mb-xl flex flex-col items-center">
            <span className="font-headline text-[40px] font-semibold leading-tight tracking-tight text-on-surface">Timia</span>
            <p className="mt-xs text-center font-body text-caption text-text-secondary">
              {t("tagline")}
            </p>
          </div>

          <div className="mb-lg flex items-center justify-center gap-5">
            <a
              href="/auth/wechat/web/start"
              aria-label={t("wechatLogin")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-[#07C160] text-white shadow-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#07C160]/30"
            >
              <WeChatMark />
            </a>
            <button
              type="button"
              aria-label={t("phoneLogin")}
              aria-pressed={method === "phone"}
              onClick={() => {
                setMethod((current) => (current === "phone" ? "email" : "phone"));
                setError(null);
              }}
              className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${
                method === "phone"
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border-subtle bg-surface-bright text-on-surface"
              }`}
            >
              <PhoneMark />
            </button>
            <a
              href="/auth/google/web/start"
              aria-label={t("googleLogin")}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-white shadow-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              <GoogleMark />
            </a>
          </div>

          <form onSubmit={onSubmit} className="space-y-lg" noValidate>
            {method === "email" ? (
              <>
                <div className="group relative">
                  <input
                    id="email"
                    className={`${fieldClass} pr-10`}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    autoComplete="email"
                    placeholder={t("emailPlaceholder")}
                    type="email"
                    required
                    aria-invalid={!!error}
                  />
                  <label htmlFor="email" className={labelClass}>
                    {t("email")}
                  </label>
                  <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                    mail
                  </span>
                </div>

                <div className="group relative">
                  <input
                    id="password"
                    className={`${fieldClass} pr-10`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError(null);
                    }}
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("passwordPlaceholder")}
                    required
                    aria-invalid={!!error}
                  />
                  <label htmlFor="password" className={labelClass}>
                    {t("password")}
                  </label>
                  <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant transition-colors group-focus-within:text-primary">
                    lock
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="relative">
                  <input
                    id="phone"
                    className={fieldClass}
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setChallenge(null);
                      setCode("");
                      setCodeCooldown(0);
                      setError(null);
                    }}
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder={t("phone")}
                    type="tel"
                    required
                    aria-invalid={!!error}
                  />
                  <label htmlFor="phone" className={labelClass}>
                    {t("phone")}
                  </label>
                </div>

                <div className="relative">
                  <input
                    id="code"
                    className={`${fieldClass} pr-28`}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setError(null);
                    }}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    placeholder={t("verificationCode")}
                    required
                    aria-invalid={!!error}
                  />
                  <label htmlFor="code" className={labelClass}>
                    {t("verificationCode")}
                  </label>
                  <button
                    type="button"
                    onClick={() => void sendCode()}
                    disabled={sendingCode || codeCooldown > 0 || loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-small font-semibold text-primary disabled:opacity-50"
                  >
                    {sendingCode
                      ? t("sendingCode")
                      : codeCooldown > 0
                        ? t("resendIn", { seconds: codeCooldown })
                        : t("sendCode")}
                  </button>
                </div>
              </>
            )}

            {sessionNotice && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-md py-sm text-small text-amber-900">
                {sessionNotice}
              </div>
            )}

            {error && <div className="text-small text-error" role="alert">{error}</div>}

            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-sm font-section-heading text-body text-on-primary shadow-sm transition-colors hover:bg-primary-hover active:scale-95 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? t("loggingIn") : t("login")}
            </button>

            <p className="text-center text-small text-text-secondary">
              {t("noAccount")}{" "}
              <Link
                className="font-semibold text-primary underline-offset-4 hover:underline decoration-2"
                href="/register"
              >
                {t("register")}
              </Link>
            </p>
          </form>
        </div>
      </div>

      <footer className="absolute bottom-lg z-10 flex w-full flex-wrap items-center justify-center gap-x-lg gap-y-sm px-container-padding text-overline text-outline-variant">
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

function WeChatMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.027-.407-.032zm-2.54 3.027c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
  );
}

function PhoneMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px] fill-current">
      <path
        fillRule="evenodd"
        d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-[22px] w-[22px]">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
